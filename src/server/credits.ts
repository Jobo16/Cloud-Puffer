import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { runs, user } from "../db/schema";
import { config } from "./config";

// 每轮输入、输出分别按千 token 向上取整；只按模型报告并保存的用量结算。
const runPoints = sql<number>`(((${runs.inputTokens} + 999) / 1000) + 3 * ((${runs.outputTokens} + 999) / 1000))`;
const today = sql`(${runs.createdAt} AT TIME ZONE 'Asia/Shanghai')::date = (now() AT TIME ZONE 'Asia/Shanghai')::date`;
const pending = sql`${runs.status} IN ('queued', 'running')`;
export const pointLimit = (override: number | null) =>
  override ?? config().DAILY_POINT_LIMIT;

/** 已结算积分与进行中请求数；只有模型报告的 token 才计入已用积分。 */
export async function creditUsage(
  userId: string,
  database: ReturnType<typeof db> = db(),
) {
  const [row] = await database
    .select({
      used: sql<number>`coalesce(sum(${runPoints}) filter (where ${today}), 0)::int`,
      pending: sql<number>`count(*) filter (where ${pending})::int`,
    })
    .from(runs)
    .where(and(eq(runs.userId, userId), or(today, pending)));
  return { used: row.used, pending: row.pending };
}

export async function creditUsageForUsers(userIds: string[]) {
  if (!userIds.length)
    return new Map<string, { used: number; pending: number }>();
  const rows = await db()
    .select({
      userId: runs.userId,
      used: sql<number>`coalesce(sum(${runPoints}) filter (where ${today}), 0)::int`,
      pending: sql<number>`count(*) filter (where ${pending})::int`,
    })
    .from(runs)
    .where(and(inArray(runs.userId, userIds), or(today, pending)))
    .groupBy(runs.userId);
  return new Map(
    rows.map(({ userId, used, pending }) => [userId, { used, pending }]),
  );
}

export async function pointStatus(userId: string) {
  const [account, meter] = await Promise.all([
    db()
      .select({ limit: user.dailyPointLimit })
      .from(user)
      .where(eq(user.id, userId)),
    creditUsage(userId),
  ]);
  const limit = pointLimit(account[0]?.limit ?? null);
  return {
    used: meter.used,
    limit,
    available: Math.max(0, limit - meter.used),
  };
}
