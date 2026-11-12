import { createHash, randomBytes } from "node:crypto";
import { Bot, GrammyError, type Api, type Context } from "grammy";
import { and, eq } from "drizzle-orm";
import { db, transaction } from "../db";
import {
  runs,
  telegramBindings,
  telegramConnections,
  user,
} from "../db/schema";
import { config } from "./config";
import { enqueueTurn, runErrors } from "./conversations";
import { AppError } from "./errors";
import { ownedWrite } from "./owned-write";

type TelegramMessage = NonNullable<Context["message"]>;
type TelegramSender = Pick<Api, "sendMessage">;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const botId = () => config().TELEGRAM_BOT_TOKEN?.split(":")[0] ?? "";

export async function telegramStatus(userId: string) {
  const env = config();
  const [row] = await db()
    .select({ connectedAt: telegramConnections.createdAt, botId: telegramConnections.botId })
    .from(telegramConnections)
    .where(eq(telegramConnections.userId, userId));
  return {
    enabled: env.TELEGRAM_ENABLED,
    botUrl: env.TELEGRAM_ENABLED
      ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}`
      : null,
    connection: row
      ? {
          connectedAt: row.connectedAt.toISOString(),
          active: env.TELEGRAM_ENABLED && row.botId === botId(),
        }
      : null,
  };
}

export async function startTelegramBinding(userId: string) {
  if (!config().TELEGRAM_ENABLED)
    throw new AppError("TELEGRAM_DISABLED", 503, "Telegram 渠道尚未开放。");
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "生成 Telegram 绑定码",
    async (tx) => {
      const data = { botId: botId(), tokenHash: digest(code), expiresAt };
      await tx
        .insert(telegramBindings)
        .values({ userId, ...data })
        .onConflictDoUpdate({ target: telegramBindings.userId, set: data });
    },
  );
  return { command: `/bind ${code}`, expiresAt: expiresAt.toISOString() };
}

/** The sender comes only from an authenticated Telegram Bot API update. */
export async function consumeTelegramBinding(
  id: string,
  peerId: string,
  chatId: string,
  code: string,
) {
  if (
    !config().TELEGRAM_ENABLED ||
    id !== botId() ||
    !peerId ||
    !chatId ||
    !/^[A-Za-z0-9_-]{24}$/.test(code)
  )
    return false;
  const tokenHash = digest(code);
  const [candidate] = await db()
    .select()
    .from(telegramBindings)
    .where(
      and(
        eq(telegramBindings.tokenHash, tokenHash),
        eq(telegramBindings.botId, id),
      ),
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
        .from(telegramBindings)
        .where(
          and(
            eq(telegramBindings.userId, candidate.userId),
            eq(telegramBindings.tokenHash, tokenHash),
            eq(telegramBindings.botId, id),
          ),
        );
      if (!owner?.emailVerified || !binding || binding.expiresAt <= new Date())
        return false;
      const [taken] = await tx
        .select()
        .from(telegramConnections)
        .where(
          and(
            eq(telegramConnections.botId, id),
            eq(telegramConnections.peerId, peerId),
          ),
        );
      if (taken && taken.userId !== owner.id) return false;
      if (!taken) {
        await tx
          .delete(telegramConnections)
          .where(eq(telegramConnections.userId, owner.id));
        await tx.insert(telegramConnections).values({
          userId: owner.id,
          botId: id,
          peerId,
          chatId,
        });
        await tx
          .update(runs)
          .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
          .where(
            and(
              eq(runs.userId, owner.id),
              eq(runs.source, "telegram"),
              eq(runs.deliveryStatus, "pending"),
            ),
          );
      }
      await tx
        .delete(telegramBindings)
        .where(eq(telegramBindings.userId, owner.id));
      return true;
    });
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "23505") return false;
    throw error;
  }
}

export async function unlinkTelegram(userId: string) {
  return ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "断开 Telegram",
    async (tx) => {
      await tx
        .delete(telegramConnections)
        .where(eq(telegramConnections.userId, userId));
      await tx
        .delete(telegramBindings)
        .where(eq(telegramBindings.userId, userId));
      await tx
        .update(runs)
        .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
        .where(
          and(
            eq(runs.userId, userId),
            eq(runs.source, "telegram"),
            eq(runs.deliveryStatus, "pending"),
          ),
        );
      return { ok: true };
    },
  );
}

export async function receiveTelegramMessage(
  api: TelegramSender,
  message: TelegramMessage,
) {
  if (
    !config().TELEGRAM_ENABLED ||
    message.chat.type !== "private" ||
    !message.from ||
    message.from.is_bot
  )
    return;
  const peerId = String(message.from.id);
  const chatId = String(message.chat.id);
  const text = message.text?.trim() ?? "";
  if (text.startsWith("/bind ")) {
    const bound = await consumeTelegramBinding(
      botId(),
      peerId,
      chatId,
      text.slice(6).trim(),
    );
    await api.sendMessage(
      message.chat.id,
      bound
        ? "绑定好了，可以在这里继续聊。"
        : "绑定未完成。请在网页设置中生成新绑定码；已绑定其他账号的 Telegram 需先解绑。",
    );
    return;
  }
  const [connection] = await db()
    .select()
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.botId, botId()),
        eq(telegramConnections.peerId, peerId),
        eq(telegramConnections.chatId, chatId),
      ),
    );
  if (!connection) return;
  const unsupported = !text || Boolean(message.photo || message.document || message.voice || message.audio || message.video || message.sticker);
  await enqueueTurn(connection.userId, {
    source: "telegram",
    text: (text || "[收到非文字消息，当前尚不能读取]").slice(0, 12000),
    requestKey: `${connection.id}:${message.message_id}`,
    channelId: connection.id,
    errorCode: unsupported
      ? "UNSUPPORTED_MESSAGE"
      : text.length > 12000
        ? "MESSAGE_TOO_LONG"
        : undefined,
  });
}

export function telegramReplyText(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 3900) return trimmed;
  let prefix = "";
  for (const char of trimmed) {
    if (prefix.length + char.length > 3850) break;
    prefix += char;
  }
  return `${prefix}\n\n完整回复请在网页查看。`;
}

export async function deliverTelegramRun(id: string, api?: TelegramSender) {
  const [run] = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.id, id),
        eq(runs.source, "telegram"),
        eq(runs.deliveryStatus, "pending")),
    );
  if (!run || ["queued", "running"].includes(run.status)) return;
  const [connection] = await db()
    .select()
    .from(telegramConnections)
    .where(
      and(
        eq(telegramConnections.id, run.channelId!),
        eq(telegramConnections.userId, run.userId),
        eq(telegramConnections.botId, botId())),
    );
  if (
    !api ||
    !config().TELEGRAM_ENABLED ||
    !connection ||
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
    .returning({ id: runs.id });
  if (!claimed) return;
  try {
    const [active] = await db()
      .select({ id: telegramConnections.id })
      .from(telegramConnections)
      .where(eq(telegramConnections.id, connection.id));
    const [current] = await db()
      .select({ status: runs.deliveryStatus })
      .from(runs)
      .where(eq(runs.id, id));
    if (current?.status !== "submitting") return;
    if (!active) {
      await db()
        .update(runs)
        .set({ deliveryStatus: "not_sent", updatedAt: new Date() })
        .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "submitting")));
      return;
    }
    const text = telegramReplyText(
      run.status === "completed"
        ? run.output?.trim() || "这次没有生成文字回复，请在网页查看。"
        : (runErrors[run.errorCode ?? ""] ?? "这次回复没有完成，请在网页查看。"),
    );
    await api.sendMessage(Number(connection.chatId), text);
    await db()
      .update(runs)
      .set({ deliveryStatus: "accepted", updatedAt: new Date() })
      .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "submitting")));
  } catch (error) {
    await db()
      .update(runs)
      .set({
        deliveryStatus: error instanceof GrammyError ? "failed" : "unknown",
        deliveryError: error instanceof GrammyError ? "TELEGRAM_REJECTED" : "TELEGRAM_UNKNOWN",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "submitting")));
  }
}

export function createTelegramBot() {
  if (!config().TELEGRAM_ENABLED) return;
  const bot = new Bot(config().TELEGRAM_BOT_TOKEN!);
  bot.on("message", (ctx) => receiveTelegramMessage(bot.api, ctx.message));
  bot.catch(() => console.error("telegram_update_failed"));
  return bot;
}
