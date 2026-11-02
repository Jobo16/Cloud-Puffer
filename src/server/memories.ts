import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { memories } from "../db/schema";
import { AppError } from "./errors";
import { ownedWrite, type Actor } from "./owned-write";

export const memoryInput = z.object({
  content: z.string().trim().min(1).max(1000),
});
export const listMemories = (userId: string) =>
  db()
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.createdAt))
    .limit(100);
export async function saveMemory(
  actor: Actor,
  input: z.input<typeof memoryInput>,
) {
  const data = memoryInput.parse(input);
  return ownedWrite(actor, "已记住", async (tx) => {
    const [existing] = await tx
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, actor.userId),
          eq(memories.requestKey, actor.operationKey),
        ),
      );
    if (existing) return existing;
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(memories)
      .where(eq(memories.userId, actor.userId));
    if (count.count >= 100)
      throw new AppError("MEMORY_LIMIT", 409, "记忆已满，请先整理已有记忆。");
    const [memory] = await tx
      .insert(memories)
      .values({ userId: actor.userId, requestKey: actor.operationKey, ...data })
      .returning();
    return memory;
  });
}
export async function updateMemory(
  actor: Actor,
  id: string,
  version: number,
  content: string,
) {
  const data = memoryInput.parse({ content });
  return ownedWrite(actor, "已更新记忆", async (tx) => {
    const [memory] = await tx
      .update(memories)
      .set({
        ...data,
        version: sql`${memories.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memories.id, id),
          eq(memories.userId, actor.userId),
          eq(memories.version, version),
        ),
      )
      .returning();
    if (!memory)
      throw new AppError(
        "CONFLICT",
        409,
        "这条记忆已更新或不存在，请刷新后重试。",
      );
    return memory;
  });
}
export async function forgetMemory(actor: Actor, id: string, version: number) {
  return ownedWrite(actor, "已忘记", async (tx) => {
    const [memory] = await tx
      .delete(memories)
      .where(
        and(
          eq(memories.id, id),
          eq(memories.userId, actor.userId),
          eq(memories.version, version),
        ),
      )
      .returning({ id: memories.id });
    if (!memory)
      throw new AppError(
        "CONFLICT",
        409,
        "这条记忆已更新或不存在，请刷新后重试。",
      );
    return memory;
  });
}
