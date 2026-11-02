import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { memories } from "../db/schema";
import { AppError } from "./errors";
import { ownedWrite, type Actor } from "./owned-write";

export const memoryInput = z.object({
  content: z.string().trim().min(1).max(1000),
});
const normalizeContent = (content: string) =>
  content.trim().replace(/\s+/gu, " ");

export const listMemories = (userId: string) =>
  db()
    .select()
    .from(memories)
    .where(eq(memories.userId, userId))
    .orderBy(desc(memories.updatedAt), desc(memories.id))
    .limit(100);

const modelMemory = ({
  id,
  content,
  version,
}: typeof memories.$inferSelect) => ({
  id,
  content,
  version,
});

export const memoryRecallInput = z.object({
  query: z.string().trim().max(200).default(""),
  offset: z.number().int().min(0).max(100).default(0),
});

/** 小规模记忆用字面包含查询；空查询浏览全部，每页最多十条，只返回当前账号记录。 */
export async function recallMemories(
  userId: string,
  input: z.input<typeof memoryRecallInput>,
) {
  const { query, offset } = memoryRecallInput.parse(input);
  const needle = normalizeContent(query).toLowerCase();
  const matches = (await listMemories(userId)).filter((row) =>
    normalizeContent(row.content).toLowerCase().includes(needle),
  );
  const items = matches.slice(offset, offset + 10).map(modelMemory);
  const next = offset + items.length;
  return {
    items,
    total: matches.length,
    nextOffset: next < matches.length ? next : null,
  };
}

export async function saveMemory(
  actor: Actor,
  input: z.input<typeof memoryInput>,
) {
  const data = memoryInput.parse(input);
  return ownedWrite(actor, "已记住", async (tx) => {
    // ownedWrite 的账号锁串行化检查与写入，不需要额外的去重表或后台任务。
    const rows = await tx
      .select()
      .from(memories)
      .where(eq(memories.userId, actor.userId));
    const normalized = normalizeContent(data.content);
    const existing = rows.find((row) => row.requestKey === actor.operationKey);
    if (existing) {
      if (normalizeContent(existing.content) !== normalized)
        throw new AppError(
          "REQUEST_CONFLICT",
          409,
          "请求标识已被使用，请重新提交。",
        );
      return existing;
    }
    const duplicate = rows.find(
      (row) => normalizeContent(row.content) === normalized,
    );
    if (duplicate) return duplicate;
    if (rows.length >= 100)
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
    const rows = await tx
      .select()
      .from(memories)
      .where(eq(memories.userId, actor.userId));
    if (!rows.some((row) => row.id === id && row.version === version))
      throw new AppError(
        "CONFLICT",
        409,
        "这条记忆已更新或不存在，请刷新后重试。",
      );
    if (
      rows.some(
        (row) =>
          row.id !== id &&
          normalizeContent(row.content) === normalizeContent(data.content),
      )
    )
      throw new AppError(
        "MEMORY_DUPLICATE",
        409,
        "已有相同内容的记忆，请整理后再修改。",
      );
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
