import { and, eq } from "drizzle-orm";
import { transaction } from "../db";
import { runs, user } from "../db/schema";
import { AppError } from "./errors";

export type Actor = {
  userId: string;
  operationKey: string;
  runId?: string;
  toolName?: string;
};
type TransactionDb = Parameters<Parameters<typeof transaction>[0]>[0];

/** A cancelled run cannot write. Successful tool facts are saved in the same transaction as the change. */
export async function ownedWrite<T>(
  actor: Actor,
  label: string,
  fn: (tx: TransactionDb) => Promise<T>,
): Promise<T> {
  return transaction(async (tx) => {
    const [owner] = await tx
      .select()
      .from(user)
      .where(eq(user.id, actor.userId))
      .for("update");
    if (!owner?.emailVerified)
      throw new AppError("UNAUTHORIZED", 401, "请先登录并验证邮箱。");
    const run = actor.runId
      ? (
          await tx
            .select()
            .from(runs)
            .where(and(eq(runs.id, actor.runId), eq(runs.userId, actor.userId)))
            .for("update")
        )[0]
      : null;
    if (actor.runId && (!run || run.status !== "running"))
      throw new AppError("RUN_STOPPED", 409, "本轮已结束，操作未执行。");
    const result = await fn(tx);
    if (run) {
      const activities = run.activities.filter(
        (a) => a.id !== actor.operationKey,
      );
      activities.push({
        id: actor.operationKey,
        name: actor.toolName ?? "action",
        label,
        status: "completed",
        result,
      });
      await tx
        .update(runs)
        .set({ activities, updatedAt: new Date() })
        .where(eq(runs.id, run.id));
    }
    return result;
  });
}
