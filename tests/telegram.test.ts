import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool } from "../src/db";
import {
  conversations,
  runs,
  telegramBindings,
  telegramConnections,
  user,
} from "../src/db/schema";
import { enqueueTurn, history } from "../src/server/conversations";
import {
  consumeTelegramBinding,
  deliverTelegramRun,
  receiveTelegramMessage,
  startTelegramBinding,
  telegramReplyText,
  unlinkTelegram,
} from "../src/server/telegram";

const botId = "123456";
let owner: string;
let stranger: string;
const codeOf = (binding: { command: string }) => binding.command.split(" ")[1];
const sender = () => ({ sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) });
type TelegramMessage = Parameters<typeof receiveTelegramMessage>[1];
type TelegramSender = Parameters<typeof receiveTelegramMessage>[0];
const message = (
  peerId: number,
  overrides: Record<string, unknown> = {},
) =>
  ({
    message_id: 42,
    chat: { id: peerId, type: "private" },
    from: { id: peerId, is_bot: false },
    text: "你好",
    ...overrides,
  }) as TelegramMessage;

beforeEach(async () => {
  owner = randomUUID();
  stranger = randomUUID();
  await db().insert(user).values(
    [owner, stranger].map((id) => ({
      id,
      name: "Test",
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

async function connect(userId = owner, peerId = "1234") {
  expect(
    await consumeTelegramBinding(
      botId,
      peerId,
      peerId,
      codeOf(await startTelegramBinding(userId)),
    ),
  ).toBe(true);
  return (
    await db()
      .select()
      .from(telegramConnections)
      .where(eq(telegramConnections.userId, userId))
  )[0];
}

describe("Telegram channel", () => {
  it("stores a hashed one-use code and prevents another account claiming the sender", async () => {
    const old = await startTelegramBinding(owner);
    const current = await startTelegramBinding(owner);
    const [stored] = await db()
      .select()
      .from(telegramBindings)
      .where(eq(telegramBindings.userId, owner));
    expect(JSON.stringify(stored)).not.toContain(codeOf(current));
    expect(await consumeTelegramBinding(botId, "1234", "1234", codeOf(old))).toBe(false);
    expect(await consumeTelegramBinding("other", "1234", "1234", codeOf(current))).toBe(false);
    expect(await consumeTelegramBinding(botId, "1234", "1234", codeOf(current))).toBe(true);
    expect(await consumeTelegramBinding(botId, "1234", "1234", codeOf(current))).toBe(false);
    const other = await startTelegramBinding(stranger);
    expect(await consumeTelegramBinding(botId, "1234", "1234", codeOf(other))).toBe(false);
  });

  it("accepts only a bound private sender and deduplicates updates", async () => {
    const connection = await connect();
    const api = sender();
    await receiveTelegramMessage(api as TelegramSender, message(1234, { chat: { id: 1234, type: "group" } }));
    await receiveTelegramMessage(api as TelegramSender, message(9999));
    await Promise.all([
      receiveTelegramMessage(api as TelegramSender, message(1234)),
      receiveTelegramMessage(api as TelegramSender, message(1234)),
    ]);
    const turns = (await history(owner)).runs;
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ source: "telegram", input: "你好", status: "queued" });
    expect((await history(stranger)).runs).toHaveLength(0);
    expect(api.sendMessage).not.toHaveBeenCalled();
    await expect(
      enqueueTurn(stranger, {
        source: "telegram",
        text: "steal",
        requestKey: randomUUID(),
        channelId: connection.id,
      }),
    ).rejects.toMatchObject({ code: "CHANNEL_CHANGED" });
  });

  it("keeps binding commands out of chat and rejects media without pretending to read it", async () => {
    const api = sender();
    const binding = await startTelegramBinding(owner);
    await receiveTelegramMessage(api as TelegramSender, message(1234, { text: binding.command }));
    expect((await history(owner)).runs).toHaveLength(0);
    expect(api.sendMessage).toHaveBeenCalledOnce();
    await receiveTelegramMessage(api as TelegramSender, message(1234, { text: undefined, photo: [{ file_id: "private" }] }));
    const [run] = (await history(owner)).runs;
    expect(run.status).toBe("failed");
    expect(run.error).toContain("仅支持文字");
  });

  it("sends one bounded reply, and unlinking stops later deliveries", async () => {
    const connection = await connect();
    await db().insert(conversations).values({ userId: owner }).onConflictDoNothing();
    const [conversation] = await db().select().from(conversations).where(eq(conversations.userId, owner));
    const [run] = await db().insert(runs).values({
      userId: owner,
      conversationId: conversation.id,
      source: "telegram",
      requestKey: randomUUID(),
      input: "test",
      output: "😊".repeat(2500),
      status: "completed",
      channelId: connection.id,
      deliveryStatus: "pending",
    }).returning();
    const api = sender();
    await Promise.all([
      deliverTelegramRun(run.id, api as TelegramSender),
      deliverTelegramRun(run.id, api as TelegramSender),
    ]);
    expect(api.sendMessage).toHaveBeenCalledOnce();
    expect(api.sendMessage.mock.calls[0][1].length).toBeLessThan(4096);
    expect(api.sendMessage.mock.calls[0][1]).toContain("完整回复请在网页查看");
    expect((await db().select().from(runs).where(eq(runs.id, run.id)))[0].deliveryStatus).toBe("accepted");
    const [second] = await db().insert(runs).values({
      userId: owner,
      conversationId: conversation.id,
      source: "telegram",
      requestKey: randomUUID(),
      input: "again",
      output: "reply",
      status: "completed",
      channelId: connection.id,
      deliveryStatus: "pending",
    }).returning();
    await unlinkTelegram(owner);
    await deliverTelegramRun(second.id, api as TelegramSender);
    expect(api.sendMessage).toHaveBeenCalledOnce();
    expect((await db().select().from(runs).where(eq(runs.id, second.id)))[0].deliveryStatus).toBe("not_sent");
    expect(telegramReplyText("😊".repeat(2500))).not.toContain("�");
  });
});
