import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, transaction } from "../db";
import {
  channels,
  qqConnections,
  conversations,
  runs,
  user,
} from "../db/schema";
import { stickerById } from "../lib/stickers";
import { config, modelConfigured } from "./config";
import { creditUsage, pointLimit, pointStatus } from "./credits";
import { AppError } from "./errors";
import { AGENT_QUEUE, queue } from "./queue";

export const turnInput = z.object({
  text: z.string().trim().min(1).max(12000),
  requestKey: z.string().min(1).max(150),
});
export const runErrors: Record<string, string> = {
  MODEL_NOT_CONFIGURED:
    "助手还未连接模型服务，暂时不能回复。你仍可在事项中管理待办。",
  LIMIT_REACHED: "今日积分已用完，北京时间零点恢复。已有事项仍可管理。",
  ACCOUNT_PAUSED: "当前对话已暂停。已有事项仍可管理。",
  BUSY: "已有多条消息等待处理，请稍后再试。",
  MODEL_FAILED: "这次回复没有完成，请重试。已经保存的事项和记忆仍然有效。",
  INTERRUPTED: "服务重启中断了这次回复，已完成的操作保留，请先查看结果再继续。",
  UNSUPPORTED_MESSAGE: "当前开发版本仅支持文字消息，文件和语音接入仍在开发中。",
  MESSAGE_TOO_LONG: "消息太长了，请分成几条发送（每条最多 12,000 字符）。",
};
export const usage = pointStatus;
type Incoming = {
  source: "web" | "wechat" | "qq";
  channelId?: string;
  contextToken?: string;
  errorCode?: string;
};
export async function enqueueTurn(
  userId: string,
  input: z.input<typeof turnInput>,
  incoming: Incoming = { source: "web" },
) {
  const data = turnInput.parse(input);
  return transaction(async (tx, client) => {
    const [owner] = await tx
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!owner?.emailVerified)
      throw new AppError("UNAUTHORIZED", 401, "请先登录并验证邮箱。");
    if (incoming.source === "wechat") {
      const [channel] = await tx
        .select()
        .from(channels)
        .where(
          and(
            eq(channels.id, incoming.channelId!),
            eq(channels.userId, userId),
          ),
        );
      if (!channel)
        throw new AppError("CHANNEL_CHANGED", 409, "微信连接已失效。");
    }
    if (incoming.source === "qq") {
      const [channel] = await tx
        .select()
        .from(qqConnections)
        .where(
          and(
            eq(qqConnections.id, incoming.channelId!),
            eq(qqConnections.userId, userId),
            eq(qqConnections.appId, config().QQ_APP_ID ?? ""),
          ),
        );
      if (!config().QQ_ENABLED || !channel)
        throw new AppError("CHANNEL_CHANGED", 409, "QQ 连接已失效。");
    }
    const [existing] = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          eq(runs.source, incoming.source),
          eq(runs.requestKey, data.requestKey),
        ),
      );
    if (existing) {
      if (existing.input !== data.text)
        throw new AppError(
          "REQUEST_CONFLICT",
          409,
          "请求标识已被使用，请重新提交。",
        );
      return runView(existing);
    }
    const meter = await creditUsage(userId, tx);
    const limit = pointLimit(owner.dailyPointLimit);
    const errorCode =
      incoming.errorCode ??
      (!modelConfigured()
        ? "MODEL_NOT_CONFIGURED"
        : limit === 0
          ? "ACCOUNT_PAUSED"
          : meter.used >= limit
            ? "LIMIT_REACHED"
            : meter.pending >= 3
              ? "BUSY"
              : null);
    if (errorCode && incoming.source === "web")
      throw new AppError(
        errorCode,
        errorCode === "MODEL_NOT_CONFIGURED" ? 503 : 429,
        runErrors[errorCode],
      );
    await tx.insert(conversations).values({ userId }).onConflictDoNothing();
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId));
    const [run] = await tx
      .insert(runs)
      .values({
        userId,
        conversationId: conversation.id,
        input: data.text,
        requestKey: data.requestKey,
        source: incoming.source,
        channelId: incoming.channelId,
        contextToken: incoming.contextToken,
        status: errorCode ? "failed" : "queued",
        errorCode,
        deliveryStatus: incoming.source !== "web" ? "pending" : "not_sent",
      })
      .returning();
    await queue().send(
      AGENT_QUEUE,
      { runId: run.id },
      {
        singletonKey: userId,
        db: { executeSql: (text, values) => client.query(text, values) },
      },
    );
    return runView(run);
  });
}
export function runView(run: typeof runs.$inferSelect) {
  return {
    id: run.id,
    input: run.input,
    output: run.output,
    sticker: run.status === "completed" ? stickerById(run.stickerId) : null,
    source: run.source,
    status: run.status,
    activities: run.activities.filter((a) => a.name !== "choose_sticker"),
    error: run.errorCode
      ? (runErrors[run.errorCode] ?? "本轮未完成，请稍后重试。")
      : null,
    deliveryStatus: run.deliveryStatus,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}
export async function history(
  userId: string,
  before?: { time: string; id: string },
) {
  const rows = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNull(runs.clearedAt),
        before
          ? sql`(${runs.createdAt}, ${runs.id}) < (${new Date(before.time)}, ${before.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(51);
  return {
    runs: rows.slice(0, 50).reverse().map(runView),
    hasMore: rows.length > 50,
  };
}
export async function cancelRun(userId: string, id: string) {
  await db()
    .update(runs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(runs.id, id),
        eq(runs.userId, userId),
        inArray(runs.status, ["queued", "running"]),
      ),
    );
  return { ok: true };
}
export async function clearHistory(userId: string) {
  return transaction(async (tx) => {
    await tx.select().from(user).where(eq(user.id, userId)).for("update");
    const [pending] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          inArray(runs.status, ["queued", "running"]),
        ),
      )
      .limit(1);
    if (pending)
      throw new AppError("BUSY", 409, "请先停止当前回复，再清空对话。");
    // Erase content while retaining token usage, so clearing cannot reset today's points.
    await tx
      .update(runs)
      .set({
        input: "",
        output: "",
        stickerId: null,
        activities: [],
        modelMessages: [],
        contextToken: null,
        clearedAt: new Date(),
        deliveryStatus: "not_sent",
        updatedAt: new Date(),
      })
      .where(eq(runs.userId, userId));
    return { ok: true };
  });
}
const beijingTime = (date: Date) =>
  date.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" });

export function modelTurnInput(
  run: Pick<typeof runs.$inferSelect, "input" | "createdAt">,
) {
  return `消息发送时的北京时间：${beijingTime(run.createdAt)}\n${run.input}`;
}

function briefText(value: string, limit: number) {
  if (value.length <= limit) return value;
  const head = Math.floor(limit / 2);
  return `${value.slice(0, head)}\n[中间内容已省略；如需准确内容请让用户重发]\n${value.slice(-head)}`;
}

function activitySummary(
  activity: (typeof runs.$inferSelect)["activities"][number],
) {
  const result = activity.result;
  const record =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  const facts = Object.fromEntries(
    ["id", "title", "dueAt", "completed", "version"].flatMap((key) =>
      record[key] === undefined ? [] : [[key, record[key]]],
    ),
  );
  return { name: activity.name, label: activity.label, ...facts };
}

export async function modelHistory(userId: string, currentId: string) {
  const [current] = await db()
    .select()
    .from(runs)
    .where(and(eq(runs.id, currentId), eq(runs.userId, userId)));
  const rows = await db()
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNull(runs.clearedAt),
        sql`(${runs.createdAt}, ${runs.id}) < (${current.createdAt}, ${currentId}::uuid)`,
        inArray(runs.status, ["completed", "failed", "cancelled"]),
      ),
    )
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(12);
  // Keep recent turns contiguous. This is a character ceiling, not a token count.
  // The provider remains the source of truth for token usage and billing.
  let budget = 12000;
  const chosen: { user: string; assistant: string }[] = [];
  for (const run of rows) {
    // 记忆工具的旧快照可能已修改或删除；下一轮由记忆模块提供当前记录。
    // 保留原聊天文字及界面操作记录，忘记记忆不等于清空聊天。
    const activities = run.activities.filter(
      (a) =>
        a.status === "completed" &&
        !["save_memory", "update_memory", "forget_memory"].includes(a.name),
    );
    const user = modelTurnInput({
      input: briefText(run.input, 4000),
      createdAt: run.createdAt,
    });
    const assistant =
      [
        briefText(run.output, 4000),
        activities.length
          ? `已确认操作：${JSON.stringify(activities.map(activitySummary))}`
          : "",
        run.status !== "completed" ? "本轮回复未正常结束。" : "",
      ]
        .filter(Boolean)
        .join("\n") || "本轮未完成。";
    const size = user.length + assistant.length;
    if (size > budget) break;
    budget -= size;
    chosen.push({ user, assistant });
  }
  return chosen.reverse().flatMap((run) => [
    { role: "user" as const, content: run.user },
    { role: "assistant" as const, content: run.assistant },
  ]);
}
