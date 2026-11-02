import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { db, pool } from "../src/db";
import { conversations, memories, runs, user } from "../src/db/schema";
import { executeRun } from "../src/server/agent";
import { history, modelHistory } from "../src/server/conversations";
import {
  forgetMemory,
  listMemories,
  recallMemories,
  saveMemory,
  updateMemory,
} from "../src/server/memories";
import { createTask } from "../src/server/tasks";

const fixture = vi.hoisted(() => ({ model: null as unknown }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({ chatModel: () => fixture.model }),
}));
let owner: string;
let stranger: string;
const actor = (userId = owner, operationKey = randomUUID()) => ({
  userId,
  operationKey,
});
beforeEach(async () => {
  owner = randomUUID();
  stranger = randomUUID();
  await db()
    .insert(user)
    .values(
      [owner, stranger].map((id) => ({
        id,
        name: "Memory test",
        email: `${id}@jojobot.local`,
        emailVerified: true,
      })),
    );
});
afterEach(async () => {
  await db().delete(user).where(eq(user.id, owner));
  await db().delete(user).where(eq(user.id, stranger));
});
afterAll(async () => {
  await pool().end();
});

async function seedMemories(
  count: number,
  content = (i: number) => `记录 ${i}`,
) {
  return db()
    .insert(memories)
    .values(
      Array.from({ length: count }, (_, i) => ({
        userId: owner,
        requestKey: randomUUID(),
        content: content(i),
        createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)),
        updatedAt: new Date(Date.UTC(2020, 0, 1, 0, 0, i)),
      })),
    )
    .returning();
}
async function seedRun(values: Partial<typeof runs.$inferInsert> = {}) {
  await db()
    .insert(conversations)
    .values({ userId: owner })
    .onConflictDoNothing();
  const [conversation] = await db()
    .select()
    .from(conversations)
    .where(eq(conversations.userId, owner));
  const [run] = await db()
    .insert(runs)
    .values({
      userId: owner,
      conversationId: conversation.id,
      source: "web",
      requestKey: randomUUID(),
      input: "记住刚才的偏好",
      ...values,
    })
    .returning();
  return run;
}

describe("explicit memory", () => {
  it("deduplicates concurrent equivalent notes without sharing across accounts", async () => {
    const [a, b] = await Promise.all([
      saveMemory(actor(), { content: "  回答简洁，\n  少用表情  " }),
      saveMemory(actor(), { content: "回答简洁， 少用表情" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await listMemories(owner)).toHaveLength(1);
    const other = await saveMemory(actor(stranger), { content: a.content });
    expect(other.id).not.toBe(a.id);
    expect(
      (await recallMemories(stranger, {})).items.map((row) => row.id),
    ).toEqual([other.id]);
  });

  it("keeps request retries idempotent and rejects reuse for different content", async () => {
    const caller = actor();
    const saved = await saveMemory(caller, { content: "回答用中文" });
    expect((await saveMemory(caller, { content: "回答用中文" })).id).toBe(
      saved.id,
    );
    await expect(
      saveMemory(caller, { content: "回答用英文" }),
    ).rejects.toMatchObject({ code: "REQUEST_CONFLICT" });
    expect((await listMemories(owner))[0].content).toBe("回答用中文");
  });

  it("checks ownership and version before editing, rejects duplicate edits and recalls the current version", async () => {
    const [first, second] = await seedMemories(2);
    await expect(
      updateMemory(actor(stranger), first.id, 1, "修改"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateMemory(actor(), first.id, 1, second.content),
    ).rejects.toMatchObject({ code: "MEMORY_DUPLICATE" });
    const updated = await updateMemory(actor(), first.id, 1, "喝咖啡不加糖");
    expect(updated.version).toBe(2);
    expect((await recallMemories(owner, {})).items[0]).toMatchObject({
      id: first.id,
      content: "喝咖啡不加糖",
      version: 2,
    });
    await expect(
      updateMemory(actor(), first.id, 1, "失效写入"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      forgetMemory(actor(stranger), first.id, 2),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(forgetMemory(actor(), first.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await forgetMemory(actor(), first.id, 2);
    expect((await recallMemories(owner, { query: "咖啡" })).items).toEqual([]);
    expect(
      (await recallMemories(owner, {})).items.map((row) => row.id),
    ).toEqual([second.id]);
  });

  it("allows an existing note at capacity but rejects new notes", async () => {
    const rows = await seedMemories(100);
    expect((await saveMemory(actor(), { content: rows[0].content })).id).toBe(
      rows[0].id,
    );
    await expect(
      saveMemory(actor(), { content: "新增第 101 条" }),
    ).rejects.toMatchObject({ code: "MEMORY_LIMIT" });
    expect(await listMemories(owner)).toHaveLength(100);
  });

  it("returns complete notes without summarizing or exposing account metadata", async () => {
    const [saved] = await seedMemories(1, () => '"\n'.repeat(490) + "完整结尾");
    const found = await recallMemories(owner, { query: "完整结尾" });
    expect(found.items).toHaveLength(1);
    expect(found.items[0].content).toBe(saved.content);
    expect(found.items[0]).not.toHaveProperty("userId");
    expect(found.items[0]).not.toHaveProperty("requestKey");
  });

  it("supports literal keyword search and deterministic browsing pages", async () => {
    const rows = await seedMemories(23, (i) => `Coffee  偏好 ${i}`);
    await saveMemory(actor(stranger), { content: "Coffee 私人偏好" });
    const first = await recallMemories(owner, { query: "coffee 偏好" });
    expect(first.total).toBe(23);
    expect(first.items).toHaveLength(10);
    expect(first.nextOffset).toBe(10);
    const second = await recallMemories(owner, { offset: first.nextOffset! });
    const last = await recallMemories(owner, { offset: second.nextOffset! });
    expect(last.nextOffset).toBeNull();
    expect(
      [...first.items, ...second.items, ...last.items].map((item) => item.id),
    ).toEqual(rows.toReversed().map((row) => row.id));
    expect((await recallMemories(owner, { query: "%" })).total).toBe(0);
    await expect(recallMemories(owner, { offset: -1 })).rejects.toThrow();
  });

  it("omits obsolete memory tool snapshots but preserves chat text, task facts and visible history", async () => {
    const previous = await seedRun({
      status: "running",
      input: "记住：喜欢喝茶",
      output: "已记住。",
      createdAt: new Date("2020-01-01"),
    });
    const saved = await saveMemory(
      { ...actor(), runId: previous.id, toolName: "save_memory" },
      { content: "只在旧工具记录中出现的正文" },
    );
    await createTask(
      { ...actor(), runId: previous.id, toolName: "create_task" },
      { title: "保留的待办事实" },
    );
    await db()
      .update(runs)
      .set({ status: "completed" })
      .where(eq(runs.id, previous.id));
    await forgetMemory(actor(), saved.id, saved.version);
    const current = await seedRun();
    const context = JSON.stringify(await modelHistory(owner, current.id));
    expect(context).not.toContain("只在旧工具记录中出现的正文");
    expect(context).toContain("记住：喜欢喝茶");
    expect(context).toContain("保留的待办事实");
    expect(JSON.stringify(await history(owner))).toContain(
      "只在旧工具记录中出现的正文",
    );
    expect((await recallMemories(owner, {})).items).toEqual([]);
  });

  it("keeps long-term notes out of the initial prompt and lets the agent recall and update on demand", async () => {
    const [old] = await seedMemories(12, (i) =>
      i === 0 ? "最早偏好：咖啡加糖" : `${i}:` + "长".repeat(990),
    );
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const call =
          step++ === 0
            ? {
                toolName: "list_memories",
                input: { query: "最早偏好", offset: 0 },
              }
            : step === 2
              ? {
                  toolName: "update_memory",
                  input: {
                    id: old.id,
                    version: 1,
                    content: "最早偏好：咖啡不加糖",
                  },
                }
              : null;
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              ...(call
                ? [
                    {
                      type: "tool-call" as const,
                      toolCallId: `memory-${step}`,
                      toolName: call.toolName,
                      input: JSON.stringify(call.input),
                    },
                  ]
                : [
                    { type: "text-start" as const, id: "reply" },
                    {
                      type: "text-delta" as const,
                      id: "reply",
                      delta: "已更新，以后咖啡不加糖。",
                    },
                    { type: "text-end" as const, id: "reply" },
                  ]),
              {
                type: "finish",
                finishReason: {
                  unified: call ? "tool-calls" : "stop",
                  raw: call ? "tool_calls" : "stop",
                },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 5, text: 5, reasoning: 0 },
                },
              },
            ],
          }),
        };
      },
    });
    fixture.model = model;
    const run = await seedRun({
      input: "更新最早的咖啡偏好，记住现在不加糖了。",
    });
    await executeRun(run.id);
    expect(model.doStreamCalls).toHaveLength(3);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain(
      old.content,
    );
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      old.content,
    );
    expect((await recallMemories(owner, { query: "最早偏好" })).items).toEqual([
      { id: old.id, version: 2, content: "最早偏好：咖啡不加糖" },
    ]);
    const [finished] = await db()
      .select()
      .from(runs)
      .where(eq(runs.id, run.id));
    expect(finished.status).toBe("completed");
    expect(finished.activities).toHaveLength(1);
    expect(finished.activities[0].name).toBe("update_memory");
  });
});
