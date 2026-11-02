import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { tasks } from "../db/schema";
import { AppError } from "./errors";
import { ownedWrite, type Actor } from "./owned-write";

export const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(4000).default(""),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
});
export const taskUpdate = taskInput.partial().extend({
  completed: z.boolean().optional(),
  version: z.number().int().positive(),
});
export const listTasks = (userId: string) =>
  db()
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.completed), desc(tasks.createdAt))
    .limit(200);
export async function createTask(
  actor: Actor,
  input: z.input<typeof taskInput>,
) {
  const data = taskInput.parse(input);
  return ownedWrite(actor, "已添加待办", async (tx) => {
    const [existing] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, actor.userId),
          eq(tasks.requestKey, actor.operationKey),
        ),
      );
    if (existing) return existing;
    const [task] = await tx
      .insert(tasks)
      .values({
        userId: actor.userId,
        requestKey: actor.operationKey,
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
      })
      .returning();
    return task;
  });
}
export async function updateTask(
  actor: Actor,
  id: string,
  input: z.input<typeof taskUpdate>,
) {
  const { version, dueAt, ...data } = taskUpdate.parse(input);
  return ownedWrite(actor, "已更新待办", async (tx) => {
    const [task] = await tx
      .update(tasks)
      .set({
        ...data,
        ...(dueAt !== undefined
          ? { dueAt: dueAt ? new Date(dueAt) : null }
          : {}),
        version: sql`${tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.userId, actor.userId),
          eq(tasks.version, version),
        ),
      )
      .returning();
    if (!task)
      throw new AppError(
        "CONFLICT",
        409,
        "这条待办已更新或不存在，请刷新后重试。",
      );
    return task;
  });
}
export async function deleteTask(actor: Actor, id: string, version: number) {
  return ownedWrite(actor, "已删除待办", async (tx) => {
    const [task] = await tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.userId, actor.userId),
          eq(tasks.version, version),
        ),
      )
      .returning({ id: tasks.id });
    if (!task)
      throw new AppError(
        "CONFLICT",
        409,
        "这条待办已更新或不存在，请刷新后重试。",
      );
    return task;
  });
}
