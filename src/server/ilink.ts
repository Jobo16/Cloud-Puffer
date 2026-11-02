import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, lt, or } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db, transaction } from "../db";
import { bindings, channels, runs, user } from "../db/schema";
import { config } from "./config";
import { enqueueTurn, runErrors } from "./conversations";
import { AppError } from "./errors";

const ORIGIN = "https://ilinkai.weixin.qq.com";
const baseInfo = { channel_version: "0.1.0", bot_agent: "JOJOBOT/0.1.0" };
export function allowedIlinkOrigin(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".weixin.qq.com") ||
    url.port ||
    url.username ||
    url.password ||
    !["", "/"].includes(url.pathname) ||
    url.search ||
    url.hash
  ) {
    throw new AppError(
      "INVALID_CHANNEL_HOST",
      502,
      "微信返回了无法识别的连接地址。",
    );
  }
  return url.origin;
}
export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(config().CHANNEL_ENCRYPTION_KEY, "hex"),
    iv,
  );
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function decryptToken(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config().CHANNEL_ENCRYPTION_KEY, "hex"),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
const responseCodes = z
  .object({ ret: z.number().optional(), errcode: z.number().optional() })
  .passthrough();
async function request(
  origin: string,
  path: string,
  body?: object,
  token?: string,
  signal?: AbortSignal,
) {
  const headers: Record<string, string> = {
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": "256",
  };
  if (body)
    Object.assign(headers, {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      "X-WECHAT-UIN": Buffer.from(
        String(randomBytes(4).readUInt32BE()),
      ).toString("base64"),
    });
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${allowedIlinkOrigin(origin)}${path}`, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(40000)])
      : AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!response.ok)
    throw new AppError("ILINK_HTTP", 502, "暂时无法连接微信，请稍后重试。");
  // iLink can acknowledge an accepted submission with an empty HTTP 200 response.
  const text = await response.text();
  const data = responseCodes.parse(text ? JSON.parse(text) : {});
  const errorCode = data.ret || data.errcode;
  if (errorCode)
    throw new AppError(
      errorCode === -14 ? "ILINK_EXPIRED" : "ILINK_REJECTED",
      502,
      errorCode === -14
        ? "微信登录已失效，请重新绑定。"
        : "微信未接受请求，请稍后再试或重新发一条消息。",
    );
  return data;
}
const qrSchema = z.object({
  qrcode: z.string().min(1),
  qrcode_img_content: z.string().min(1),
});
const bindSchema = z.object({
  status: z.string(),
  bot_token: z.string().optional(),
  ilink_bot_id: z.string().optional(),
  baseurl: z.string().optional(),
  ilink_user_id: z.string().optional(),
  redirect_host: z.string().optional(),
});
export async function channelStatus(userId: string) {
  const [channel] = await db()
    .select({
      id: channels.id,
      status: channels.status,
      error: channels.lastError,
      connectedAt: channels.createdAt,
    })
    .from(channels)
    .where(eq(channels.userId, userId));
  return { enabled: config().ILINK_ENABLED, connection: channel ?? null };
}
export async function startBinding(userId: string) {
  if (!config().ILINK_ENABLED)
    throw new AppError(
      "CHANNEL_DISABLED",
      503,
      "微信连接尚未开放，请先通过网页使用。",
    );
  return transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, userId)).for("update");
    const [recent] = await tx
      .select()
      .from(bindings)
      .where(
        and(
          eq(bindings.userId, userId),
          lt(bindings.createdAt, new Date(Date.now() + 1)),
        ),
      )
      .orderBy(bindings.createdAt)
      .limit(1);
    if (recent && Date.now() - recent.createdAt.getTime() < 15000)
      throw new AppError("TOO_FAST", 429, "请稍后再刷新二维码。");
    const qr = qrSchema.parse(
      await request(ORIGIN, "/ilink/bot/get_bot_qrcode?bot_type=3", {
        local_token_list: [],
      }),
    );
    await tx.delete(bindings).where(eq(bindings.userId, userId));
    const [binding] = await tx
      .insert(bindings)
      .values({
        userId,
        qrCode: qr.qrcode,
        image: await QRCode.toDataURL(qr.qrcode_img_content),
        expiresAt: new Date(Date.now() + 5 * 60000),
      })
      .returning();
    return { id: binding.id, image: binding.image, status: binding.status };
  });
}
export async function pollBinding(
  userId: string,
  id: string,
  verifyCode?: string,
) {
  if (!config().ILINK_ENABLED)
    throw new AppError("CHANNEL_DISABLED", 503, "微信连接尚未开放。");
  const [binding] = await db()
    .select()
    .from(bindings)
    .where(and(eq(bindings.id, id), eq(bindings.userId, userId)));
  if (!binding || binding.expiresAt.getTime() < Date.now())
    return { status: "expired" };
  if (binding.status === "confirmed") return { status: "confirmed" };
  let response;
  try {
    response = await request(
      binding.baseUrl,
      `/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(binding.qrCode)}${verifyCode ? `&verify_code=${encodeURIComponent(verifyCode)}` : ""}`,
      undefined,
      undefined,
      AbortSignal.timeout(40_000),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError")
      return { status: "wait" };
    throw error;
  }
  const status = bindSchema.parse(response);
  return transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, userId)).for("update");
    const [current] = await tx
      .select()
      .from(bindings)
      .where(and(eq(bindings.id, id), eq(bindings.userId, userId)))
      .for("update");
    if (!current || current.expiresAt.getTime() < Date.now())
      return { status: "expired" };
    if (current.status === "confirmed") return { status: "confirmed" };
    if (status.status === "confirmed") {
      if (!status.bot_token || !status.ilink_bot_id || !status.ilink_user_id)
        throw new AppError(
          "INVALID_BINDING",
          502,
          "微信身份不完整，请重新扫码。",
        );
      const [other] = await tx
        .select()
        .from(channels)
        .where(
          or(
            eq(channels.peerId, status.ilink_user_id),
            eq(channels.botId, status.ilink_bot_id),
          ),
        );
      if (other && other.userId !== userId)
        throw new AppError(
          "ALREADY_BOUND",
          409,
          "这个微信已经绑定另一个账号，请先在那里解绑。",
        );
      // A new connection ID invalidates all pending deliveries addressed to the old binding.
      await tx.delete(channels).where(eq(channels.userId, userId));
      await tx.insert(channels).values({
        userId,
        botId: status.ilink_bot_id,
        peerId: status.ilink_user_id,
        tokenCipher: encryptToken(status.bot_token),
        baseUrl: allowedIlinkOrigin(status.baseurl || ORIGIN),
      });
    }
    const baseUrl =
      status.status === "scaned_but_redirect" && status.redirect_host
        ? allowedIlinkOrigin(status.redirect_host)
        : current.baseUrl;
    await tx
      .update(bindings)
      .set({ status: status.status, baseUrl })
      .where(eq(bindings.id, id));
    return { status: status.status };
  });
}
export async function unlinkChannel(userId: string) {
  return transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, userId)).for("update");
    await tx.delete(bindings).where(eq(bindings.userId, userId));
    await tx.delete(channels).where(eq(channels.userId, userId));
    await tx
      .update(runs)
      .set({
        deliveryStatus: "not_sent",
        deliveryError: "CHANNEL_CHANGED",
        updatedAt: new Date(),
      })
      .where(and(eq(runs.userId, userId), eq(runs.deliveryStatus, "pending")));
    return { ok: true };
  });
}
const itemSchema = z.object({
  type: z.number(),
  text_item: z.object({ text: z.string() }).optional(),
});
const messageSchema = z.object({
  message_id: z.union([z.number(), z.string()]).optional(),
  client_id: z.string().optional(),
  seq: z.number().optional(),
  from_user_id: z.string(),
  to_user_id: z.string().optional(),
  group_id: z.string().optional(),
  create_time_ms: z.number().optional(),
  message_type: z.number(),
  message_state: z.number(),
  context_token: z.string().optional(),
  item_list: z.array(itemSchema).default([]),
});
const updatesSchema = z.object({
  msgs: z.array(messageSchema).default([]),
  get_updates_buf: z.string().optional(),
});
export function inboundText(
  message: z.infer<typeof messageSchema>,
  peerId: string,
) {
  if (
    message.from_user_id !== peerId ||
    message.group_id ||
    message.message_type !== 1 ||
    message.message_state !== 2
  )
    return null;
  const text = message.item_list
    .filter((i) => i.type === 1)
    .map((i) => i.text_item?.text ?? "")
    .join("\n")
    .trim();
  const unsupported =
    message.item_list.some((i) => i.type !== 1) || !text || text.length > 12000;
  // If a stable remote ID is absent, hash the complete immutable event; never use poll cursor as identity.
  const key = String(
    message.message_id ??
      message.client_id ??
      createHash("sha256").update(JSON.stringify(message)).digest("hex"),
  );
  return {
    text: unsupported ? "[暂不支持的微信消息]" : text,
    key,
    errorCode: unsupported ? "UNSUPPORTED_MESSAGE" : undefined,
  };
}
async function pollChannel(id: string, signal: AbortSignal) {
  while (!signal.aborted) {
    const [channel] = await db()
      .select()
      .from(channels)
      .where(eq(channels.id, id));
    if (!channel || channel.status !== "connected") return;
    try {
      const updates = updatesSchema.parse(
        await request(
          channel.baseUrl,
          "/ilink/bot/getupdates",
          { get_updates_buf: channel.cursor, base_info: baseInfo },
          decryptToken(channel.tokenCipher),
          signal,
        ),
      );
      for (const message of updates.msgs) {
        const input = inboundText(message, channel.peerId);
        if (!input) continue;
        await enqueueTurn(
          channel.userId,
          {
            text: input.text,
            requestKey: `${channel.id}:${createHash("sha256").update(input.key).digest("hex")}`,
          },
          {
            source: "wechat",
            channelId: channel.id,
            contextToken: message.context_token,
            errorCode: input.errorCode,
          },
        );
      }
      // Cursor advances only after durable, deduplicated ingestion of the entire batch.
      if (updates.get_updates_buf)
        await db()
          .update(channels)
          .set({
            cursor: updates.get_updates_buf,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(channels.id, id));
      await delay(250, undefined, { signal });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof AppError && error.code === "CHANNEL_CHANGED") return;
      if (error instanceof AppError && error.code === "ILINK_EXPIRED") {
        await db()
          .update(channels)
          .set({
            status: "error",
            lastError: "微信登录已失效，请重新绑定。",
            updatedAt: new Date(),
          })
          .where(eq(channels.id, id));
        return;
      }
      await db()
        .update(channels)
        .set({ lastError: "连接暂时中断，正在重试。", updatedAt: new Date() })
        .where(eq(channels.id, id));
      await delay(5000, undefined, { signal }).catch(() => undefined);
    }
  }
}
/** One shared worker owns polling; no process or container is allocated per account. */
export async function superviseChannels(signal: AbortSignal) {
  const active = new Map<string, AbortController>();
  const polling = new Set<Promise<void>>();
  try {
    while (!signal.aborted) {
      const connections = await db()
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.status, "connected"));
      const valid = new Set(connections.map((c) => c.id));
      for (const [id, controller] of active)
        if (!valid.has(id)) controller.abort();
      for (const { id } of connections)
        if (!active.has(id)) {
          const controller = new AbortController();
          active.set(id, controller);
          const task = pollChannel(
            id,
            AbortSignal.any([signal, controller.signal]),
          )
            .catch(() => console.error("channel_poll_error"))
            .finally(() => {
              active.delete(id);
              polling.delete(task);
            });
          polling.add(task);
        }
      await delay(2000, undefined, { signal });
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    for (const controller of active.values()) controller.abort();
    await Promise.allSettled(polling);
  }
}
export async function deliverRun(id: string) {
  const [run] = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.id, id),
        eq(runs.source, "wechat"),
        eq(runs.deliveryStatus, "pending"),
      ),
    );
  if (!run) return;
  const [channel] = await db()
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.id, run.channelId!),
        eq(channels.userId, run.userId),
        eq(channels.status, "connected"),
      ),
    );
  if (!channel || !run.contextToken || run.status === "cancelled") {
    await db()
      .update(runs)
      .set({
        deliveryStatus: "not_sent",
        deliveryError: "CHANNEL_UNAVAILABLE",
        updatedAt: new Date(),
      })
      .where(eq(runs.id, id));
    return;
  }
  const [claimed] = await db()
    .update(runs)
    .set({ deliveryStatus: "submitting", updatedAt: new Date() })
    .where(and(eq(runs.id, id), eq(runs.deliveryStatus, "pending")))
    .returning();
  if (!claimed) return;
  const text =
    run.output ||
    runErrors[run.errorCode ?? ""] ||
    "这次回复未完成，请在网页查看。";
  const body =
    text.length > 3800
      ? `${text.slice(0, 3700)}\n\n内容较长，完整回复已保存在网页主对话中。`
      : text;
  try {
    await request(
      channel.baseUrl,
      "/ilink/bot/sendmessage",
      {
        msg: {
          from_user_id: "",
          to_user_id: channel.peerId,
          client_id: `jojobot-${id}`,
          message_type: 2,
          message_state: 2,
          context_token: run.contextToken,
          item_list: [{ type: 1, text_item: { text: body } }],
        },
        base_info: baseInfo,
      },
      decryptToken(channel.tokenCipher),
    );
    await db()
      .update(runs)
      .set({ deliveryStatus: "accepted", updatedAt: new Date() })
      .where(eq(runs.id, id));
  } catch (error) {
    const definite =
      error instanceof AppError &&
      ["ILINK_REJECTED", "ILINK_EXPIRED"].includes(error.code);
    await db()
      .update(runs)
      .set({
        deliveryStatus: definite ? "failed" : "unknown",
        deliveryError: definite ? error.code : "UNKNOWN",
        updatedAt: new Date(),
      })
      .where(eq(runs.id, id));
  }
}
