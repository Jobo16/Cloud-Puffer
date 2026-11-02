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
import { channels, conversations, runs, user } from "../src/db/schema";
import {
  createTask,
  listTasks,
  updateTask,
  deleteTask,
} from "../src/server/tasks";
import { saveMemory, listMemories, forgetMemory } from "../src/server/memories";
import {
  cancelRun,
  clearHistory,
  enqueueTurn,
  history,
  modelHistory,
  modelTurnInput,
  usage,
} from "../src/server/conversations";
import {
  allowedIlinkOrigin,
  deliverRun,
  encryptToken,
  inboundText,
  unlinkChannel,
} from "../src/server/ilink";
import { preferences, updatePreferences } from "../src/server/preferences";
import { executeRun } from "../src/server/agent";
import { createWorkerQueue, AGENT_QUEUE } from "../src/server/queue";
import { readBody, requireUser } from "../src/server/http";
import { appState } from "../src/server/state";
import { auth } from "../src/server/auth";
import { DELETE, GET, PATCH, POST } from "../src/app/api/app/[...path]/route";
import {
  GET as ADMIN_GET,
  PATCH as ADMIN_PATCH,
} from "../src/app/api/admin/route";
import { consumeQqBinding } from "../src/server/qq";

const fixture = vi.hoisted(() => ({ model: null as unknown }));
type ModelChunk =
  Awaited<
    ReturnType<MockLanguageModelV4["doStream"]>
  >["stream"] extends ReadableStream<infer C>
    ? C
    : never;
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => ({ chatModel: () => fixture.model }),
}));
let owner: string;
let stranger: string;
const actor = (id = owner, key = randomUUID()) => ({
  userId: id,
  operationKey: key,
});
beforeEach(async () => {
  owner = randomUUID();
  stranger = randomUUID();
  await db()
    .insert(user)
    .values(
      [owner, stranger].map((id) => ({
        id,
        name: "Test",
        email: `${id}@jojobot.local`,
        emailVerified: true,
      })),
    );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await db().delete(user).where(eq(user.id, owner));
  await db().delete(user).where(eq(user.id, stranger));
});
afterAll(async () => {
  await pool().end();
});
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
      input: "test",
      ...values,
    })
    .returning();
  return run;
}
const getRun = async (id: string) =>
  (await db().select().from(runs).where(eq(runs.id, id)))[0];

describe("owned, durable operations", () => {
  it("deduplicates concurrent creates and rejects cross-user edits and stale versions", async () => {
    const caller = actor();
    const [a, b] = await Promise.all([
      createTask(caller, { title: "提交资料" }),
      createTask(caller, { title: "提交资料" }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await listTasks(stranger)).toHaveLength(0);
    await expect(
      updateTask(actor(stranger), a.id, { title: "stolen", version: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await updateTask(actor(), a.id, { completed: true, version: 1 });
    await expect(deleteTask(actor(), a.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await listTasks(owner))[0]).toMatchObject({
      completed: true,
      version: 2,
    });
  });
  it("requires verified email for all business writes", async () => {
    await db()
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, owner));
    await expect(
      createTask(actor(), { title: "forbidden" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("saves successful tool facts with the mutation and blocks writes after cancellation", async () => {
    const run = await seedRun({ status: "running" });
    await createTask(
      { ...actor(), runId: run.id, toolName: "create_task" },
      { title: "one" },
    );
    expect((await getRun(run.id)).activities[0]).toMatchObject({
      status: "completed",
      name: "create_task",
    });
    await cancelRun(owner, run.id);
    await expect(
      createTask({ ...actor(), runId: run.id }, { title: "too late" }),
    ).rejects.toMatchObject({ code: "RUN_STOPPED" });
    expect(await listTasks(owner)).toHaveLength(1);
  });
  it("keeps memory private and deleting memory leaves earlier chat unchanged", async () => {
    const m = await saveMemory(actor(), { content: "喜欢简洁的回答" });
    await seedRun({ status: "completed", output: "历史内容" });
    expect(await listMemories(stranger)).toHaveLength(0);
    await expect(forgetMemory(actor(stranger), m.id, 1)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await forgetMemory(actor(), m.id, 1);
    expect(await listMemories(owner)).toHaveLength(0);
    expect((await history(owner)).runs[0].output).toBe("历史内容");
  });
  it("clears chat content without replenishing quota or deleting tasks/memory", async () => {
    await seedRun({
      status: "completed",
      input: "private",
      output: "private",
      contextToken: "private",
      inputTokens: 1,
      outputTokens: 1,
    });
    await createTask(actor(), { title: "keep" });
    await saveMemory(actor(), { content: "keep" });
    await clearHistory(owner);
    expect((await history(owner)).runs).toHaveLength(0);
    expect((await usage(owner)).used).toBe(4);
    expect(await listTasks(owner)).toHaveLength(1);
    expect(await listMemories(owner)).toHaveLength(1);
    const [retained] = await db()
      .select()
      .from(runs)
      .where(eq(runs.userId, owner));
    expect(retained).toMatchObject({
      input: "",
      output: "",
      activities: [],
      modelMessages: [],
      contextToken: null,
    });
  });
  it("does not put future turns into the current prompt", async () => {
    await seedRun({
      input: "before",
      status: "completed",
      createdAt: new Date("2026-01-01"),
    });
    const current = await seedRun({
      input: "now",
      createdAt: new Date("2026-01-02"),
    });
    await seedRun({
      input: "future",
      status: "completed",
      createdAt: new Date("2026-01-03"),
    });
    const messages = await modelHistory(owner, current.id);
    expect(JSON.stringify(messages)).toContain("before");
    expect(JSON.stringify(messages)).not.toContain("future");
  });
  it("reuses the exact prior user message and bounds long context", async () => {
    const first = await seedRun({
      status: "completed",
      input: "第一条消息",
      output: "第一条回复",
      createdAt: new Date("2026-11-02T04:00:00Z"),
    });
    const current = await seedRun({
      input: "新消息",
      createdAt: new Date("2026-11-02T04:01:00Z"),
    });
    const messages = await modelHistory(owner, current.id);
    expect(messages[0].content).toBe(modelTurnInput(first));
    expect(messages[1].content).toBe("第一条回复");
    await db()
      .update(runs)
      .set({ input: "长".repeat(12000), output: "答".repeat(12000) })
      .where(eq(runs.id, first.id));
    const shortened = await modelHistory(owner, current.id);
    expect(JSON.stringify(shortened).length).toBeLessThan(12000);
    expect(JSON.stringify(shortened)).toContain("中间内容已省略");
  });
  it("atomically enqueues, deduplicates, and serializes turns per account", async () => {
    const key = randomUUID();
    const first = await enqueueTurn(owner, { text: "one", requestKey: key });
    expect(
      (await enqueueTurn(owner, { text: "one", requestKey: key })).id,
    ).toBe(first.id);
    const second = await enqueueTurn(owner, {
      text: "two",
      requestKey: randomUUID(),
    });
    const boss = createWorkerQueue();
    await boss.start();
    try {
      const jobs = await boss.fetch<{ runId: string }>(AGENT_QUEUE, {
        batchSize: 100,
      });
      const ownJobs = jobs.filter((j) =>
        [first.id, second.id].includes(j.data.runId),
      );
      expect(ownJobs).toHaveLength(1);
      expect(ownJobs[0].data.runId).toBe(first.id);
      for (const job of jobs) await boss.complete(AGENT_QUEUE, job.id);
      const next = await boss.fetch<{ runId: string }>(AGENT_QUEUE, {
        batchSize: 100,
      });
      expect(next.some((j) => j.data.runId === second.id)).toBe(true);
      for (const job of next) await boss.complete(AGENT_QUEUE, job.id);
    } finally {
      await boss.stop();
    }
  });
  it("charges reported tokens from failed and cancelled runs and blocks spent accounts", async () => {
    await db()
      .update(user)
      .set({ dailyPointLimit: 12 })
      .where(eq(user.id, owner));
    await seedRun({
      status: "failed",
      errorCode: "MODEL_FAILED",
      inputTokens: 1000,
      outputTokens: 1,
    });
    await seedRun({ status: "cancelled", inputTokens: 1000, outputTokens: 1 });
    await seedRun({ status: "completed", inputTokens: 1000, outputTokens: 1 });
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        enqueueTurn(owner, { text: `last ${n}`, requestKey: randomUUID() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(0);
    expect((await usage(owner)).used).toBe(12);
  });
  it("rounds input and output points separately and resets by Beijing date", async () => {
    await seedRun({
      status: "completed",
      inputTokens: 1001,
      outputTokens: 2001,
    });
    await seedRun({
      status: "completed",
      inputTokens: 1000,
      outputTokens: 1000,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    expect(await usage(owner)).toMatchObject({
      used: 11,
      limit: 1000,
      available: 989,
    });
  });
  it("checks points again before a queued run reaches the model", async () => {
    await db()
      .update(user)
      .set({ dailyPointLimit: 4 })
      .where(eq(user.id, owner));
    const queued = await seedRun({ status: "queued" });
    await seedRun({
      status: "completed",
      inputTokens: 1000,
      outputTokens: 1000,
    });
    await executeRun(queued.id);
    expect(await getRun(queued.id)).toMatchObject({
      status: "failed",
      errorCode: "LIMIT_REACHED",
    });
  });
});

describe("assistant configuration", () => {
  it("keeps settings private, patches only supplied fields and validates edits", async () => {
    await updatePreferences(owner, {
      agentName: "小舟",
      systemPrompt: "温和直接，先给结论",
      tasksEnabled: false,
    });
    await updatePreferences(owner, { stickersEnabled: false });
    expect((await appState(owner)).preferences).toEqual({
      agentName: "小舟",
      systemPrompt: "温和直接，先给结论",
      tasksEnabled: false,
      memoryEnabled: true,
      stickersEnabled: false,
    });
    expect(await preferences(stranger)).toMatchObject({
      agentName: "小肥鱼",
      systemPrompt: "",
      tasksEnabled: true,
      stickersEnabled: true,
    });
    await updatePreferences(stranger, { memoryEnabled: false });
    expect((await preferences(stranger)).agentName).toBe("小肥鱼");
    for (const input of [
      { agentName: "  " },
      { systemPrompt: "a".repeat(4001) },
      {},
    ]) {
      await expect(updatePreferences(owner, input)).rejects.toThrow();
    }
    expect((await preferences(owner)).agentName).toBe("小舟");
  });
});

describe("agent execution", () => {
  it.each(["web", "wechat", "qq"] as const)(
    "uses saved system prompt and enforces tool switches on %s, then restores them on the next turn",
    async (source) => {
      await saveMemory(actor(), { content: "仅在启用记忆时注入的偏好" });
      await updatePreferences(owner, {
        agentName: "小舟",
        systemPrompt: "温和直接，先给结论",
        tasksEnabled: false,
        memoryEnabled: false,
        stickersEnabled: false,
      });
      const model = new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream<ModelChunk>({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "reply" },
              { type: "text-delta", id: "reply", delta: "你好" },
              { type: "text-end", id: "reply" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 6,
                    cacheRead: 4,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 5, text: 5, reasoning: 0 },
                },
              },
            ],
          }),
        }),
      });
      fixture.model = model;
      const run = await seedRun({ source });
      await executeRun(run.id);
      expect((await getRun(run.id)).status).toBe("completed");
      expect((await getRun(run.id)).cacheReadTokens).toBe(4);
      const first = model.doStreamCalls[0];
      expect(first.tools ?? []).toHaveLength(0);
      const prompt = JSON.stringify(first.prompt);
      expect(prompt).toContain("小舟");
      expect(prompt).toContain("温和直接，先给结论");
      expect(prompt).not.toContain("仅在启用记忆时注入的偏好");
      // Disabling agent tools does not delete records or block the manual management UI.
      await createTask(actor(), { title: "手动管理仍然可用" });
      expect(await listMemories(owner)).toHaveLength(1);
      await updatePreferences(owner, {
        tasksEnabled: true,
        memoryEnabled: true,
        stickersEnabled: true,
      });
      const next = await seedRun({ source });
      await executeRun(next.id);
      const second = model.doStreamCalls[1];
      const names = second.tools?.map((entry) => entry.name);
      expect(names).toContain("create_task");
      expect(names).toContain("save_memory");
      expect(names?.includes("choose_sticker")).toBe(source !== "wechat");
      // Long-term memory is recalled through tools, never injected automatically.
      expect(JSON.stringify(second.prompt)).not.toContain(
        "仅在启用记忆时注入的偏好",
      );
    },
  );
  it("cannot execute a disabled task tool even when a provider emits that tool call", async () => {
    await updatePreferences(owner, {
      tasksEnabled: false,
      memoryEnabled: false,
      stickersEnabled: false,
    });
    fixture.model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<ModelChunk>({
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "disabled",
              toolName: "create_task",
              input: JSON.stringify({
                title: "不得创建",
                notes: "",
                dueAt: null,
              }),
            },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
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
      }),
    });
    const run = await seedRun();
    await executeRun(run.id);
    expect(await listTasks(owner)).toHaveLength(0);
    expect((await getRun(run.id)).activities).toHaveLength(0);
  });

  it("selects a real catalog sticker through the model tool loop and allows a sticker-only reply", async () => {
    let step = 0;
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    };
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<ModelChunk>({
          chunks: [
            { type: "stream-start", warnings: [] },
            ...(step++ === 0
              ? [
                  {
                    type: "tool-call" as const,
                    toolCallId: "pick-sticker",
                    toolName: "choose_sticker",
                    input: JSON.stringify({ id: "cheer" }),
                  },
                ]
              : []),
            {
              type: "finish",
              finishReason: {
                unified: step === 1 ? "tool-calls" : "stop",
                raw: step === 1 ? "tool_calls" : "stop",
              },
              usage,
            },
          ],
        }),
      }),
    });
    fixture.model = model;
    const run = await seedRun({ input: "我通过考试啦，发张表情就好" });
    await executeRun(run.id);
    expect(await getRun(run.id)).toMatchObject({
      status: "completed",
      stickerId: "cheer",
      output: "",
    });
    expect((await history(owner)).runs[0].sticker?.src).toBe(
      "/stickers/cheer.png",
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain(
      "不套用客服开场",
    );
  });
  it("executes a tool through the real SDK, persists its result, and completes the reply", async () => {
    const modelUsage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    };
    let step = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<ModelChunk>({
          chunks:
            step++ === 0
              ? [
                  { type: "stream-start", warnings: [] },
                  {
                    type: "tool-call",
                    toolCallId: "create-one",
                    toolName: "create_task",
                    input: JSON.stringify({
                      title: "整理书桌",
                      notes: "",
                      dueAt: null,
                    }),
                  },
                  {
                    type: "finish",
                    finishReason: { unified: "tool-calls", raw: "tool_calls" },
                    usage: modelUsage,
                  },
                ]
              : [
                  { type: "stream-start", warnings: [] },
                  { type: "text-start", id: "reply" },
                  {
                    type: "text-delta",
                    id: "reply",
                    delta: "已记下整理书桌。",
                  },
                  { type: "text-end", id: "reply" },
                  {
                    type: "finish",
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: modelUsage,
                  },
                ],
        }),
      }),
    });
    fixture.model = model;
    const run = await seedRun({ input: "帮我记下整理书桌" });
    await executeRun(run.id);
    const result = await getRun(run.id);
    expect(result.status).toBe("completed");
    expect(result).toMatchObject({ inputTokens: 20, outputTokens: 10 });
    expect((await usage(owner)).used).toBe(4);
    expect(result.output).toBe("已记下整理书桌。");
    expect(result.activities).toHaveLength(1);
    expect((await listTasks(owner))[0].title).toBe("整理书桌");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(JSON.stringify(model.doStreamCalls[1].prompt)).toContain(
      "tool-result",
    );
    await executeRun(run.id);
    expect(await listTasks(owner)).toHaveLength(1);
  });
  it("marks an interrupted run without replaying completed writes", async () => {
    const run = await seedRun({ status: "running" });
    await createTask({ ...actor(), runId: run.id }, { title: "already done" });
    await executeRun(run.id);
    expect(await getRun(run.id)).toMatchObject({
      status: "failed",
      errorCode: "INTERRUPTED",
    });
    expect(await listTasks(owner)).toHaveLength(1);
  });
});

describe("channel and HTTP boundaries", () => {
  it("restricts admin user search and point-limit changes to the configured verified account", async () => {
    const password = "test-only-password-123";
    const signups = await Promise.all([
      auth().api.signUpEmail({
        body: { name: "Admin", email: "admin@jojobot.local", password },
      }),
      auth().api.signUpEmail({
        body: {
          name: "Regular",
          email: `${randomUUID()}@jojobot.local`,
          password,
        },
      }),
    ]);
    try {
      await db()
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, signups[0].user.id));
      await db()
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, signups[1].user.id));
      const headersFor = async (email: string) => {
        const response = await auth().api.signInEmail({
          body: { email, password },
          asResponse: true,
        });
        return {
          Cookie: response.headers
            .getSetCookie()
            .map((cookie) => cookie.split(";")[0])
            .join("; "),
          Origin: "http://localhost:3031",
          "Content-Type": "application/json",
        };
      };
      const adminHeaders = await headersFor("admin@jojobot.local");
      const regularHeaders = await headersFor(signups[1].user.email);
      const url = `http://localhost:3031/api/admin?search=${encodeURIComponent(`${owner}@jojobot.local`)}`;
      expect((await ADMIN_GET(new Request(url))).status).toBe(401);
      expect(
        (await ADMIN_GET(new Request(url, { headers: regularHeaders }))).status,
      ).toBe(403);
      const list = await ADMIN_GET(new Request(url, { headers: adminHeaders }));
      expect((await list.json()).users).toMatchObject([{ id: owner }]);
      const payload = JSON.stringify({ userId: owner, dailyPointLimit: 9 });
      expect(
        (
          await ADMIN_PATCH(
            new Request(url, {
              method: "PATCH",
              headers: regularHeaders,
              body: payload,
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await ADMIN_PATCH(
            new Request(url, {
              method: "PATCH",
              headers: { ...adminHeaders, Origin: "https://evil.example" },
              body: payload,
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await ADMIN_PATCH(
            new Request(url, {
              method: "PATCH",
              headers: adminHeaders,
              body: payload,
            }),
          )
        ).status,
      ).toBe(200);
      expect((await usage(owner)).limit).toBe(9);
      await ADMIN_PATCH(
        new Request(url, {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({ userId: owner, dailyPointLimit: 0 }),
        }),
      );
      await expect(
        enqueueTurn(owner, { text: "paused", requestKey: randomUUID() }),
      ).rejects.toMatchObject({ code: "ACCOUNT_PAUSED" });
    } finally {
      for (const signup of signups)
        await db().delete(user).where(eq(user.id, signup.user.id));
    }
  });
  it("verifies real auth sessions, API ownership, CSRF, and sign-out revocation", async () => {
    const email = `${randomUUID()}@jojobot.local`;
    const password = "test-only-password-123";
    const signup = await auth().api.signUpEmail({
      body: { name: "Auth test", email, password, callbackURL: "/app" },
    });
    try {
      await expect(
        auth().api.signInEmail({ body: { email, password } }),
      ).rejects.toMatchObject({ status: "FORBIDDEN" });
      await db()
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, signup.user.id));
      const signedIn = await auth().api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const headers = {
        Cookie: cookie,
        Origin: "http://localhost:3031",
        "Content-Type": "application/json",
      };
      const context = (path: string) => ({
        params: Promise.resolve({ path: path.split("/") }),
      });
      const strangerTask = await createTask(actor(), {
        title: "other user's private task",
      });
      const state = await GET(
        new Request("http://localhost:3031/api/app/state", { headers }),
        context("state"),
      );
      expect((await state.json()).tasks).toHaveLength(0);
      const pref = await PATCH(
        new Request("http://localhost:3031/api/app/preferences", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ stickersEnabled: false }),
        }),
        context("preferences"),
      );
      expect(await pref.json()).toMatchObject({ stickersEnabled: false });
      const binding = await POST(
        new Request("http://localhost:3031/api/app/qq/binding", {
          method: "POST",
          headers,
        }),
        context("qq/binding"),
      );
      expect(binding.status).toBe(200);
      expect(
        await consumeQqBinding(
          "qq-test-app",
          randomUUID(),
          (await binding.json()).command.split(" ")[1],
        ),
      ).toBe(true);
      expect((await appState(signup.user.id)).qq.connection).not.toBeNull();
      const unlink = await DELETE(
        new Request("http://localhost:3031/api/app/qq/connection", {
          method: "DELETE",
          headers,
        }),
        context("qq/connection"),
      );
      expect(unlink.status).toBe(200);
      expect((await appState(signup.user.id)).qq.connection).toBeNull();
      const unlinkWechat = await DELETE(
        new Request("http://localhost:3031/api/app/wechat/connection", {
          method: "DELETE",
          headers,
        }),
        context("wechat/connection"),
      );
      expect(unlinkWechat.status).toBe(200);
      const forbidden = await PATCH(
        new Request(`http://localhost:3031/api/app/tasks/${strangerTask.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ version: 1, title: "stolen" }),
        }),
        context(`tasks/${strangerTask.id}`),
      );
      expect(forbidden.status).toBe(409);
      const csrf = await POST(
        new Request("http://localhost:3031/api/app/tasks", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.example" },
          body: "{}",
        }),
        context("tasks"),
      );
      expect(csrf.status).toBe(403);
      await auth().api.signOut({ headers: new Headers(headers) });
      const revoked = await GET(
        new Request("http://localhost:3031/api/app/state", { headers }),
        context("state"),
      );
      expect(revoked.status).toBe(401);
    } finally {
      await db().delete(user).where(eq(user.id, signup.user.id));
    }
  });
  it("rejects untrusted redirect hosts", () => {
    expect(allowedIlinkOrigin("ilinkai.weixin.qq.com")).toBe(
      "https://ilinkai.weixin.qq.com",
    );
    for (const host of [
      "http://ilinkai.weixin.qq.com",
      "https://ilinkai.weixin.qq.com.evil.test",
      "https://evil.test",
      "https://ilinkai.weixin.qq.com/steal",
      "https://a@ilinkai.weixin.qq.com",
    ])
      expect(() => allowedIlinkOrigin(host)).toThrow();
  });
  it("only ingests finished private messages from the bound sender", () => {
    const message = {
      from_user_id: "peer",
      message_id: "42",
      message_type: 1,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text: "你好" } }],
    };
    expect(inboundText(message, "peer")).toMatchObject({
      text: "你好",
      key: "42",
    });
    expect(inboundText(message, "another")).toBeNull();
    expect(inboundText({ ...message, group_id: "group" }, "peer")).toBeNull();
    expect(
      inboundText({ ...message, item_list: [{ type: 2 }] }, "peer"),
    ).toMatchObject({ errorCode: "UNSUPPORTED_MESSAGE" });
  });
  it("records empty HTTP 200 as submission acceptance, not phone delivery", async () => {
    const [channel] = await db()
      .insert(channels)
      .values({
        userId: owner,
        botId: randomUUID(),
        peerId: randomUUID(),
        baseUrl: "https://ilinkai.weixin.qq.com",
        tokenCipher: encryptToken("test-token"),
      })
      .returning();
    await seedRun({
      source: "wechat",
      channelId: channel.id,
      deliveryStatus: "accepted",
    });
    const run = await seedRun({
      source: "wechat",
      status: "completed",
      output: "reply",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await deliverRun(run.id);
    expect((await getRun(run.id)).deliveryStatus).toBe("accepted");
    await deliverRun(run.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const state = JSON.stringify(await appState(owner));
    expect(state).not.toContain("test-token");
    expect(state).not.toContain("contextToken");
    expect(state).not.toContain("tokenCipher");
  });
  it("does not retry an uncertain delivery or send after unlinking", async () => {
    const [channel] = await db()
      .insert(channels)
      .values({
        userId: owner,
        botId: randomUUID(),
        peerId: randomUUID(),
        baseUrl: "https://ilinkai.weixin.qq.com",
        tokenCipher: encryptToken("test-token"),
      })
      .returning();
    await seedRun({
      source: "wechat",
      channelId: channel.id,
      deliveryStatus: "accepted",
    });
    const run = await seedRun({
      source: "wechat",
      status: "completed",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetcher);
    await deliverRun(run.id);
    await deliverRun(run.id);
    expect((await getRun(run.id)).deliveryStatus).toBe("unknown");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const pending = await seedRun({
      source: "wechat",
      status: "completed",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    await unlinkChannel(owner);
    await deliverRun(pending.id);
    expect((await getRun(pending.id)).deliveryStatus).toBe("not_sent");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("includes the rename guide only in the first WeChat reply", async () => {
    const [channel] = await db()
      .insert(channels)
      .values({
        userId: owner,
        botId: randomUUID(),
        peerId: randomUUID(),
        baseUrl: "https://ilinkai.weixin.qq.com",
        tokenCipher: encryptToken("test-token"),
      })
      .returning();
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/getuploadurl"))
        return Response.json({
          upload_full_url: "https://novac2c.cdn.weixin.qq.com/c2c/upload",
        });
      if (path.endsWith("/upload")) {
        expect(init?.body).toBeInstanceOf(Uint8Array);
        return new Response("", {
          status: 200,
          headers: { "x-encrypted-param": "download-param" },
        });
      }
      if (path.endsWith("/sendmessage"))
        return new Response("", { status: 200 });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const first = await seedRun({
      source: "wechat",
      status: "completed",
      output: "你好！",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    await deliverRun(first.id);
    expect((await getRun(first.id)).deliveryStatus).toBe("accepted");
    const second = await seedRun({
      source: "wechat",
      status: "completed",
      output: "第二次回复",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    await deliverRun(second.id);
    const sends = fetcher.mock.calls
      .filter(([url]) => String(url).endsWith("/sendmessage"))
      .map(([, init]) => JSON.parse(String(init?.body)).msg);
    expect(sends).toHaveLength(4);
    expect(sends[0].item_list[0].text_item.text).toContain("备注名");
    expect(sends[0].item_list[0].text_item.text).toContain("你好！");
    expect(sends[1].item_list[0]).toMatchObject({
      type: 2,
      image_item: {
        media: { encrypt_query_param: "download-param", encrypt_type: 1 },
      },
    });
    expect(sends[2].item_list[0].type).toBe(2);
    expect(sends[1].client_id).not.toBe(sends[2].client_id);
    expect(sends[3].item_list[0].text_item.text).toBe("第二次回复");
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/getuploadurl"),
      ),
    ).toHaveLength(2);
  });
  it("keeps the first reply when a welcome image cannot be uploaded", async () => {
    const [channel] = await db()
      .insert(channels)
      .values({
        userId: owner,
        botId: randomUUID(),
        peerId: randomUUID(),
        baseUrl: "https://ilinkai.weixin.qq.com",
        tokenCipher: encryptToken("test-token"),
      })
      .returning();
    const fetcher = vi.fn(async (input: string | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/sendmessage"))
        return new Response("", { status: 200 });
      if (path.endsWith("/getuploadurl"))
        return Response.json({
          upload_full_url: "https://novac2c.cdn.weixin.qq.com/c2c/upload",
        });
      if (path.endsWith("/upload")) return new Response("", { status: 503 });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const first = await seedRun({
      source: "wechat",
      status: "completed",
      output: "你好！",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    await deliverRun(first.id);
    expect((await getRun(first.id)).deliveryStatus).toBe("partial");
    const second = await seedRun({
      source: "wechat",
      status: "completed",
      output: "继续聊",
      contextToken: "context",
      channelId: channel.id,
      deliveryStatus: "pending",
    });
    await deliverRun(second.id);
    expect((await getRun(second.id)).deliveryStatus).toBe("accepted");
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/getuploadurl"),
      ),
    ).toHaveLength(1);
  });
  it("rejects unauthenticated API access and oversized request bodies", async () => {
    await expect(
      requireUser(new Request("http://localhost:3031/api/app/state")),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      readBody(
        new Request("http://localhost:3031", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "a".repeat(70000) }),
        }),
      ),
    ).rejects.toMatchObject({ code: "BODY_SIZE" });
  });
});
