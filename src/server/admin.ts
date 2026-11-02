import { desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { user } from "../db/schema";
import { config } from "./config";
import { creditUsageForUsers, pointLimit } from "./credits";
import { AppError } from "./errors";
import { requireUser } from "./http";

export const adminLimitInput = z.object({
  userId: z.string().min(1),
  dailyPointLimit: z.number().int().min(0).max(1000000).nullable(),
});

export function isAdminEmail(email: string) {
  const allowed = config().ADMIN_EMAIL.trim().toLowerCase();
  return Boolean(allowed) && email.toLowerCase() === allowed;
}

export async function requireAdmin(request: Request) {
  const owner = await requireUser(request);
  if (!isAdminEmail(owner.email))
    throw new AppError("FORBIDDEN", 403, "没有管理权限。");
  return owner;
}

export async function adminUsers(search: string) {
  const query = search.trim().slice(0, 100);
  const rows = await db()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      dailyPointLimit: user.dailyPointLimit,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(query ? ilike(user.email, `%${query}%`) : undefined)
    .orderBy(desc(user.createdAt))
    .limit(50);
  const meter = await creditUsageForUsers(rows.map((row) => row.id));
  const [{ total }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(user);
  return {
    total,
    users: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      pointLimit: pointLimit(row.dailyPointLimit),
      usedPoints: meter.get(row.id)?.used ?? 0,
    })),
  };
}

export async function updateUserPointLimit(
  input: z.input<typeof adminLimitInput>,
) {
  const { userId, dailyPointLimit } = adminLimitInput.parse(input);
  const [changed] = await db()
    .update(user)
    .set({ dailyPointLimit, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id });
  if (!changed) throw new AppError("NOT_FOUND", 404, "账号不存在。");
  return { ok: true };
}
