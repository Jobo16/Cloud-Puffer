import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ApiError,
  QQBot,
  type QQBotInboundMessage,
  type ReplyTarget,
} from "@tencent-connect/qqbot-nodejs";
import { and, eq } from "drizzle-orm";
import { db, transaction } from "../db";
import { qqBindings, qqConnections, runs, user } from "../db/schema";
import { stickerById, type StickerId } from "../lib/stickers";
import { config } from "./config";
import { enqueueTurn, runErrors } from "./conversations";
import { AppError } from "./errors";
import { ownedWrite } from "./owned-write";
import { preferences } from "./preferences";

type QqSender = Pick<QQBot, "send" | "uploadMedia">;
// Keep each file path statically bounded. A dynamic path rooted at cwd makes
// Turbopack watch the repository, so writing dev logs can trigger an HMR loop.
const stickerFiles: Record<StickerId, () => Promise<Buffer>> = {
  okay: () => readFile(join(process.cwd(), "public/stickers/okay.png")),
  cheer: () => readFile(join(process.cwd(), "public/stickers/cheer.png")),
  hug: () => readFile(join(process.cwd(), "public/stickers/hug.png")),
  thinking: () => readFile(join(process.cwd(), "public/stickers/thinking.png")),
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function qqStatus(userId: string) {
  const env = config();
  const [row] = await db()
    .select({ connectedAt: qqConnections.createdAt })
    .from(qqConnections)
    .where(
      and(
        eq(qqConnections.userId, userId),
        eq(qqConnections.appId, env.QQ_APP_ID ?? ""),
      ),
    );
  return {
    enabled: env.QQ_ENABLED,
    botUrl: env.QQ_ENABLED ? env.QQ_BOT_URL || null : null,
    connection: row ? { connectedAt: row.connectedAt.toISOString() } : null,
  };
}

export async function startQqBinding(userId: string) {
  const env = config();
  if (!env.QQ_ENABLED)
    throw new AppError("QQ_DISABLED", 503, "QQ 渠道尚未开放。");
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "生成 QQ 绑定码",
    async (tx) => {
      const data = {
        appId: env.QQ_APP_ID!,
        tokenHash: digest(code),
        expiresAt,
      };
      await tx
        .insert(qqBindings)
        .values({ userId, ...data })
        .onConflictDoUpdate({ target: qqBindings.userId, set: data });
    },
  );
  return { command: `/绑定 ${code}`, expiresAt: expiresAt.toISOString() };
}

/** Only called for an authenticated QQ gateway's private sender, never with a browser-provided peer ID. */
export async function consumeQqBinding(
  appId: string,
  peerId: string,
  code: string,
) {
  if (
    !config().QQ_ENABLED ||
    appId !== config().QQ_APP_ID ||
    !peerId ||
    !/^[A-Za-z0-9_-]{24}$/.test(code)
  )
    return false;
  const tokenHash = digest(code);
  const [candidate] = await db()
    .select()
    .from(qqBindings)
    .where(
      and(eq(qqBindings.tokenHash, tokenHash), eq(qqBindings.appId, appId)),
    );
  if (!candidate) return false;
  try {
    return await transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(user)
        .where(eq(user.id, candidate.userId))
        .for("update");
      const [binding] = await tx
        .select()
        .from(qqBindings)
        .where(
          and(
            eq(qqBindings.userId, candidate.userId),
            eq(qqBindings.tokenHash, tokenHash),
            eq(qqBindings.appId, appId),
          ),
        );
      if (!owner?.emailVerified || !binding || binding.expiresAt <= new Date())
        return false;
      const [taken] = await tx
        .select()
        .from(qqConnections)
        .where(
          and(eq(qqConnections.appId, appId), eq(qqConnections.peerId, peerId)),
        );
      if (taken && taken.userId !== owner.id) return false;
      if (!taken) {
        await tx
          .delete(qqConnections)
          .where(eq(qqConnections.userId, owner.id));
        await tx
          .insert(qqConnections)
          .values({ userId: owner.id, appId, peerId });
        await tx
          .update(runs)
          .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
          .where(
            and(
              eq(runs.userId, owner.id),
              eq(runs.source, "qq"),
              eq(runs.deliveryStatus, "pending"),
            ),
          );
      }
      await tx.delete(qqBindings).where(eq(qqBindings.userId, owner.id));
      return true;
    });
  } catch (error) {
    // Concurrent bindings by different owners are also excluded by the database constraint.
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "23505") return false;
    throw error;
  }
}

export async function unlinkQq(userId: string) {
  return ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "断开 QQ",
    async (tx) => {
      await tx.delete(qqConnections).where(eq(qqConnections.userId, userId));
      await tx.delete(qqBindings).where(eq(qqBindings.userId, userId));
      await tx
        .update(runs)
        .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
        .where(
          and(
            eq(runs.userId, userId),
            eq(runs.source, "qq"),
            eq(runs.deliveryStatus, "pending"),
          ),
        );
      return { ok: true };
    },
  );
}

export async function receiveQqMessage(
  bot: QqSender,
  msg: QQBotInboundMessage,
) {
  const env = config();
  const target = msg.replyTarget;
  if (
    !env.QQ_ENABLED ||
    msg.kind !== "c2c" ||
    msg.senderIsBot ||
    !msg.senderId ||
    !msg.messageId ||
    target?.scope !== "c2c" ||
    target.targetId !== msg.senderId ||
    target.msgId !== msg.messageId
  )
    return;
  const content = msg.content.trim();
  if (content.startsWith("/绑定")) {
    const bound = await consumeQqBinding(
      env.QQ_APP_ID!,
      msg.senderId,
      content.slice(3).trim(),
    );
    await bot.send({
      target,
      content: bound
        ? "绑定好了，可以在这里继续聊。"
        : "绑定未完成。请在网页设置中生成新绑定码；已绑定其他账号的 QQ 需先解绑。",
      extra: { msg_seq: 1 },
    });
    return;
  }
  const [connection] = await db()
    .select()
    .from(qqConnections)
    .where(
      and(
        eq(qqConnections.appId, env.QQ_APP_ID!),
        eq(qqConnections.peerId, msg.senderId),
      ),
    );
  if (!connection) return;
  const unsupported = Boolean(
    msg.attachments?.length ||
    msg.msgElements?.some((element) => element.attachments?.length),
  );
  if (!content && !unsupported) return;
  await enqueueTurn(connection.userId, {
    source: "qq",
    text: (content || "[收到附件，当前尚不能读取]").slice(0, 12000),
    requestKey: `${connection.id}:${digest(msg.messageId)}`,
    channelId: connection.id,
    contextToken: msg.messageId,
    errorCode: unsupported
      ? "UNSUPPORTED_MESSAGE"
      : content.length > 12000
        ? "MESSAGE_TOO_LONG"
        : undefined,
  });
}

// At most two text messages plus one image. Each segment stays below 4 KB in UTF-8.
export function qqTextParts(text: string) {
  const chars = Array.from(text.trim());
  const clipped =
    chars.length > 1600
      ? `${chars.slice(0, 1500).join("")}\n\n完整回复可在 云上小肥鱼网页查看。`
      : chars.join("");
  if (!clipped) return [];
  const points = Array.from(clipped);
  if (points.length <= 800) {
    const split = clipped.indexOf("\n\n");
    return split > 0 && split < clipped.length - 2
      ? [clipped.slice(0, split).trim(), clipped.slice(split + 2).trim()]
      : [clipped];
  }
  return [
    points.slice(0, 800).join("").trim(),
    points.slice(800).join("").trim(),
  ].filter(Boolean);
}

export async function deliverQqRun(id: string, bot?: QqSender) {
  const [run] = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.id, id),
        eq(runs.source, "qq"),
        eq(runs.deliveryStatus, "pending"),
      ),
    );
  if (!run || ["queued", "running"].includes(run.status)) return;
  const [connection] = await db()
    .select()
    .from(qqConnections)
    .where(
      and(
        eq(qqConnections.id, run.channelId!),
        eq(qqConnections.userId, run.userId),
        eq(qqConnections.appId, config().QQ_APP_ID ?? ""),
      ),
    );
  if (
    !bot ||
    !config().QQ_ENABLED ||
    !connection ||
    !run.contextToken ||
    run.clearedAt ||
    run.status === "cancelled"
  ) {
    await db()
      .update(runs)
      .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
      .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "pending")));
    return;
  }
  const [claimed] = await db()
    .update(runs)
    .set({ deliveryStatus: "submitting", updatedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "pending")))
    .returning();
  if (!claimed) return;
  const target: ReplyTarget = {
    scope: "c2c",
    targetId: connection.peerId,
    msgId: run.contextToken,
  };
  let sent = 0;
  let submitting = false;
  try {
    const send: QqSender["send"] = async (message) => {
      // Recheck between parts: unlinking/clearing stops any further submission.
      const [active] = await db()
        .select({ id: qqConnections.id })
        .from(qqConnections)
        .where(eq(qqConnections.id, connection.id));
      const [current] = await db()
        .select({ status: runs.deliveryStatus })
        .from(runs)
        .where(eq(runs.id, id));
      if (!active || current?.status !== "submitting")
        throw new AppError("DELIVERY_STOPPED", 409, "已停止发送。");
      submitting = true;
      const response = await bot.send({
        ...message,
        extra: { msg_seq: sent + 1 },
      });
      if (!response?.id) throw new Error("QQ_ACK_MISSING");
      sent += 1;
      submitting = false;
      return response;
    };
    const text =
      run.status === "completed"
        ? run.output
        : (runErrors[run.errorCode ?? ""] ??
          "这次回复没有完成，请在网页查看。");
    for (const content of qqTextParts(text)) await send({ target, content });
    const sticker =
      run.status === "completed" &&
      (await preferences(run.userId)).stickersEnabled
        ? stickerById(run.stickerId)
        : null;
    // Opting out while a sticker-only reply is queued must still leave a readable reply.
    if (!sticker && !sent && run.status === "completed") {
      const fallback = stickerById(run.stickerId);
      if (fallback) await send({ target, content: fallback.label });
    }
    if (sticker) {
      const upload = await bot.uploadMedia({
        target,
        fileType: 1,
        buffer: await stickerFiles[sticker.id](),
        srvSendMsg: false,
      });
      if (!upload.file_info) throw new Error("QQ_UPLOAD_FAILED");
      await send({
        target,
        msgType: 7,
        media: { file_info: upload.file_info },
      });
    }
    await db()
      .update(runs)
      .set({
        deliveryStatus: sent ? "accepted" : "not_sent",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "submitting")));
  } catch (error) {
    const rejected =
      error instanceof ApiError &&
      error.httpStatus >= 400 &&
      error.httpStatus < 500;
    const status =
      submitting && !rejected ? "unknown" : sent ? "partial" : "failed";
    await db()
      .update(runs)
      .set({
        deliveryStatus: status,
        deliveryError:
          error instanceof AppError ? error.code : "QQ_SEND_FAILED",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "submitting")));
  }
}

export function createQqBot() {
  const env = config();
  if (!env.QQ_ENABLED) return undefined;
  const bot = new QQBot({
    appId: env.QQ_APP_ID!,
    appSecret: env.QQ_APP_SECRET!,
    markdownSupport: false,
    intents: 1 << 25,
  });
  bot.on("message", async (_ctx, msg) => {
    try {
      await receiveQqMessage(bot, msg);
    } catch {
      console.error("qq_inbound_failed");
    }
  });
  bot.on("error", () => console.error("qq_connection_error"));
  bot.on("ready", () => console.log("QQ gateway ready."));
  return bot;
}
