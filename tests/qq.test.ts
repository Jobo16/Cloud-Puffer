import { randomUUID } from "node:crypto";
import {
  ApiError,
  type QQBot,
  type QQBotInboundMessage,
} from "@tencent-connect/qqbot-nodejs";
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
import { db, pool } from "../src/db";
import {
  conversations,
  qqBindings,
  qqConnections,
  runs,
  user,
} from "../src/db/schema";
import {
  consumeQqBinding,
  deliverQqRun,
  qqTextParts,
  receiveQqMessage,
  startQqBinding,
  unlinkQq,
} from "../src/server/qq";
import { chooseSticker } from "../src/server/stickers";
import { preferences, updatePreferences } from "../src/server/preferences";
import {
  cancelRun,
  clearHistory,
  enqueueTurn,
  history,
} from "../src/server/conversations";
import { appState } from "../src/server/state";
import { stickerById } from "../src/lib/stickers";

let owner: string;
let stranger: string;
const appId = "qq-test-app";
const codeOf = (binding: { command: string }) => binding.command.split(" ")[1];
const sender = () => ({
  send: vi
    .fn<QQBot["send"]>()
    .mockResolvedValue({ id: "accepted", timestamp: Date.now() }),
  uploadMedia: vi
    .fn<QQBot["uploadMedia"]>()
    .mockResolvedValue({ file_uuid: "test", file_info: "uploaded", ttl: 300 }),
});
const message = (
  peer: string,
  overrides: Partial<QQBotInboundMessage> = {},
): QQBotInboundMessage => ({
  rawEventType: "C2C_MESSAGE_CREATE",
  kind: "c2c",
  senderId: peer,
  content: "你好",
  messageId: "incoming-id",
  timestamp: new Date().toISOString(),
  raw: {} as QQBotInboundMessage["raw"],
  replyTarget: { scope: "c2c", targetId: peer, msgId: "incoming-id" },
  ...overrides,
});
const readRun = async (id: string) =>
  (await db().select().from(runs).where(eq(runs.id, id)))[0];
async function connect(userId = owner, peerId = randomUUID()) {
  expect(
    await consumeQqBinding(appId, peerId, codeOf(await startQqBinding(userId))),
  ).toBe(true);
  return (
    await db()
      .select()
      .from(qqConnections)
      .where(eq(qqConnections.userId, userId))
  )[0];
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
  return (
    await db()
      .insert(runs)
      .values({
        userId: owner,
        conversationId: conversation.id,
        source: "web",
        requestKey: randomUUID(),
        input: "test",
        ...values,
      })
      .returning()
  )[0];
}
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
  await db().delete(user).where(eq(user.id, owner));
  await db().delete(user).where(eq(user.id, stranger));
});
afterAll(async () => {
  await pool().end();
});

describe("QQ ownership and ingestion", () => {
  it("stores only a hash; rotates codes, expires them, and consumes each at most once", async () => {
    const old = await startQqBinding(owner);
    const current = await startQqBinding(owner);
    const [stored] = await db()
      .select()
      .from(qqBindings)
      .where(eq(qqBindings.userId, owner));
    expect(JSON.stringify(stored)).not.toContain(codeOf(current));
    expect(await consumeQqBinding(appId, "peer", codeOf(old))).toBe(false);
    expect(await consumeQqBinding("wrong-app", "peer", codeOf(current))).toBe(
      false,
    );
    const simultaneous = await Promise.all(
      ["peer", "another-peer"].map((peer) =>
        consumeQqBinding(appId, peer, codeOf(current)),
      ),
    );
    expect(simultaneous.filter(Boolean)).toHaveLength(1);
    const expired = await startQqBinding(stranger);
    await db()
      .update(qqBindings)
      .set({ expiresAt: new Date(0) })
      .where(eq(qqBindings.userId, stranger));
    expect(await consumeQqBinding(appId, "new-peer", codeOf(expired))).toBe(
      false,
    );
  });
  it("prevents two accounts claiming a private sender, including concurrent bindings", async () => {
    const a = await startQqBinding(owner);
    const b = await startQqBinding(stranger);
    const results = await Promise.all([
      consumeQqBinding(appId, "same-peer", codeOf(a)),
      consumeQqBinding(appId, "same-peer", codeOf(b)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const [row] = await db()
      .select()
      .from(qqConnections)
      .where(eq(qqConnections.peerId, "same-peer"));
    const other = row.userId === owner ? stranger : owner;
    expect(
      await consumeQqBinding(
        appId,
        "same-peer",
        codeOf(await startQqBinding(other)),
      ),
    ).toBe(false);
  });
  it("ingests only bound private senders, deduplicates events, and shares the existing queue", async () => {
    const connection = await connect();
    const bot = sender();
    await receiveQqMessage(bot, message(connection.peerId, { kind: "group" }));
    await receiveQqMessage(bot, message("stranger"));
    await receiveQqMessage(
      bot,
      message(connection.peerId, {
        replyTarget: { scope: "c2c", targetId: "other", msgId: "incoming-id" },
      }),
    );
    expect((await history(owner)).runs).toHaveLength(0);
    await Promise.all([
      receiveQqMessage(bot, message(connection.peerId)),
      receiveQqMessage(bot, message(connection.peerId)),
    ]);
    const [run] = (await history(owner)).runs;
    expect(run).toMatchObject({
      source: "qq",
      input: "你好",
      status: "queued",
      deliveryStatus: "pending",
    });
    expect((await history(owner)).runs).toHaveLength(1);
    expect((await history(stranger)).runs).toHaveLength(0);
    expect(bot.send).not.toHaveBeenCalled();
    const state = JSON.stringify(await appState(owner));
    expect(state).not.toContain(connection.peerId);
    expect(state).not.toContain("qq-test-secret");
    expect(state).not.toContain("incoming-id");
    await expect(
      enqueueTurn(
        stranger,
        { text: "steal", requestKey: randomUUID() },
        { source: "qq", channelId: connection.id },
      ),
    ).rejects.toMatchObject({ code: "CHANNEL_CHANGED" });
  });
  it("never sends binding secrets to the model and explicitly rejects media input", async () => {
    const bot = sender();
    const binding = await startQqBinding(owner);
    await receiveQqMessage(bot, message("peer", { content: binding.command }));
    expect((await history(owner)).runs).toHaveLength(0);
    expect(bot.send).toHaveBeenCalledOnce();
    await receiveQqMessage(
      bot,
      message("peer", {
        content: "看图片",
        attachments: [
          { url: "https://example.com/private", content_type: "image/png" },
        ],
      }),
    );
    const [run] = (await history(owner)).runs;
    expect(run.status).toBe("failed");
    expect(run.error).toContain("仅支持文字");
  });
  it("unlinking invalidates codes and pending deliveries; rebinding gets a new connection", async () => {
    const original = await connect();
    const binding = await startQqBinding(owner);
    const run = await seedRun({
      source: "qq",
      status: "completed",
      channelId: original.id,
      contextToken: "incoming",
      output: "hello",
      deliveryStatus: "pending",
    });
    await unlinkQq(owner);
    expect(await consumeQqBinding(appId, "peer", codeOf(binding))).toBe(false);
    const next = await connect();
    expect(next.id).not.toBe(original.id);
    const bot = sender();
    await deliverQqRun(run.id, bot);
    expect(bot.send).not.toHaveBeenCalled();
    expect((await readRun(run.id)).deliveryStatus).toBe("not_sent");
  });
});

describe("QQ delivery", () => {
  it.each(["okay", "cheer", "hug", "thinking"] as const)(
    "submits bounded text and the real %s PNG using distinct reply sequence numbers",
    async (stickerId) => {
      const connection = await connect();
      const bot = sender();
      const run = await seedRun({
        source: "qq",
        status: "completed",
        channelId: connection.id,
        contextToken: "incoming",
        output: "收到。\n\n好耶！",
        stickerId,
        deliveryStatus: "pending",
      });
      await Promise.all([deliverQqRun(run.id, bot), deliverQqRun(run.id, bot)]);
      expect(bot.send).toHaveBeenCalledTimes(3);
      expect(
        bot.send.mock.calls.map(([payload]) => payload.extra?.msg_seq),
      ).toEqual([1, 2, 3]);
      expect(bot.send.mock.calls[2][0]).toMatchObject({
        target: { msgId: "incoming", targetId: connection.peerId },
        msgType: 7,
        media: { file_info: "uploaded" },
      });
      expect(
        bot.uploadMedia.mock.calls[0][0].buffer?.subarray(1, 4).toString(),
      ).toBe("PNG");
      expect(bot.uploadMedia.mock.calls[0][0].srvSendMsg).toBe(false);
      expect((await readRun(run.id)).deliveryStatus).toBe("accepted");
      await deliverQqRun(run.id, bot);
      expect(bot.send).toHaveBeenCalledTimes(3);
    },
  );
  it("marks partial/uncertain delivery without replaying a message", async () => {
    const connection = await connect();
    for (const uncertain of [false, true]) {
      const bot = sender();
      bot.send
        .mockResolvedValueOnce({ id: "first", timestamp: Date.now() })
        .mockRejectedValueOnce(
          uncertain
            ? new Error("timeout")
            : new ApiError("rejected", 400, "/messages"),
        );
      const run = await seedRun({
        source: "qq",
        status: "completed",
        channelId: connection.id,
        contextToken: randomUUID(),
        output: "一段\n\n二段",
        deliveryStatus: "pending",
      });
      await deliverQqRun(run.id, bot);
      await deliverQqRun(run.id, bot);
      expect((await readRun(run.id)).deliveryStatus).toBe(
        uncertain ? "unknown" : "partial",
      );
      expect(bot.send).toHaveBeenCalledTimes(2);
    }
  });
  it("stops later parts after unlinking and does not send for cleared/cancelled turns", async () => {
    const connection = await connect();
    const bot = sender();
    bot.send.mockImplementationOnce(async () => {
      await unlinkQq(owner);
      return { id: "first", timestamp: Date.now() };
    });
    const run = await seedRun({
      source: "qq",
      status: "completed",
      channelId: connection.id,
      contextToken: "incoming",
      output: "一段\n\n二段",
      deliveryStatus: "pending",
    });
    await deliverQqRun(run.id, bot);
    expect(bot.send).toHaveBeenCalledOnce();
    expect((await readRun(run.id)).deliveryStatus).toBe("partial");
    const next = await connect();
    const cancelled = await seedRun({
      source: "qq",
      status: "cancelled",
      channelId: next.id,
      contextToken: "incoming",
      deliveryStatus: "pending",
    });
    await deliverQqRun(cancelled.id, bot);
    expect((await readRun(cancelled.id)).deliveryStatus).toBe("not_sent");
    await clearHistory(owner);
    await deliverQqRun(run.id, bot);
    expect(bot.send).toHaveBeenCalledOnce();
  });
  it("bounds Unicode content and directs long replies back to the full web record", () => {
    const parts = qqTextParts("😊".repeat(2000));
    expect(parts).toHaveLength(2);
    expect(parts.every((s) => Buffer.byteLength(s) < 4000)).toBe(true);
    expect(parts.join("")).toContain("完整回复");
    expect(parts.join("")).not.toContain("�");
  });
});

describe("sticker selection", () => {
  it("enforces ownership, cancellation, a fixed catalog and one sticker per turn", async () => {
    const run = await seedRun({ status: "running" });
    const actor = {
      userId: owner,
      runId: run.id,
      operationKey: "sticker",
      toolName: "choose_sticker",
    };
    await expect(
      chooseSticker({ ...actor, userId: stranger }, { id: "okay" }),
    ).rejects.toMatchObject({ code: "RUN_STOPPED" });
    expect(stickerById("../../secret")).toBeNull();
    expect(stickerById("constructor")).toBeNull();
    await chooseSticker(actor, { id: "okay" });
    await chooseSticker(actor, { id: "okay" });
    await expect(chooseSticker(actor, { id: "cheer" })).rejects.toMatchObject({
      code: "STICKER_LIMIT",
    });
    expect((await history(owner)).runs[0].sticker).toBeNull();
    await cancelRun(owner, run.id);
    await expect(chooseSticker(actor, { id: "okay" })).rejects.toMatchObject({
      code: "RUN_STOPPED",
    });
  });
  it("persists per-user preferences, suppresses consecutive repeats, and erases stickers on clear", async () => {
    await seedRun({
      status: "completed",
      stickerId: "okay",
      createdAt: new Date("2026-01-01"),
    });
    const run = await seedRun({ status: "running" });
    const actor = {
      userId: owner,
      runId: run.id,
      operationKey: "pick",
      toolName: "choose_sticker",
    };
    await expect(chooseSticker(actor, { id: "okay" })).rejects.toMatchObject({
      code: "STICKER_REPEAT",
    });
    await updatePreferences(owner, { stickersEnabled: false });
    expect(await preferences(stranger)).toMatchObject({
      stickersEnabled: true,
    });
    await expect(chooseSticker(actor, { id: "hug" })).rejects.toMatchObject({
      code: "STICKER_DISABLED",
    });
    await updatePreferences(owner, { stickersEnabled: true });
    await chooseSticker(actor, { id: "hug" });
    await db()
      .update(runs)
      .set({ status: "completed" })
      .where(eq(runs.id, run.id));
    expect((await history(owner)).runs.at(-1)?.sticker?.id).toBe("hug");
    expect((await history(owner)).runs.at(-1)?.activities).toHaveLength(0);
    await clearHistory(owner);
    expect((await readRun(run.id)).stickerId).toBeNull();
  });
  it("does not offer stickers for WeChat and rechecks opt-out before a QQ upload", async () => {
    const wechat = await seedRun({ source: "wechat", status: "running" });
    await expect(
      chooseSticker(
        { userId: owner, runId: wechat.id, operationKey: "pick" },
        { id: "hug" },
      ),
    ).rejects.toMatchObject({ code: "STICKER_DISABLED" });
    const connection = await connect();
    const bot = sender();
    const run = await seedRun({
      source: "qq",
      status: "completed",
      channelId: connection.id,
      contextToken: "incoming",
      output: "reply",
      stickerId: "cheer",
      deliveryStatus: "pending",
    });
    await updatePreferences(owner, { stickersEnabled: false });
    await deliverQqRun(run.id, bot);
    expect(bot.send).toHaveBeenCalledOnce();
    expect(bot.uploadMedia).not.toHaveBeenCalled();
    const stickerOnly = await seedRun({
      source: "qq",
      status: "completed",
      channelId: connection.id,
      contextToken: "sticker-only",
      stickerId: "cheer",
      deliveryStatus: "pending",
    });
    await deliverQqRun(stickerOnly.id, bot);
    expect(bot.send.mock.calls.at(-1)?.[0].content).toBe("好耶");
    expect((await readRun(stickerOnly.id)).deliveryStatus).toBe("accepted");
    expect(bot.uploadMedia).not.toHaveBeenCalled();
  });
});
