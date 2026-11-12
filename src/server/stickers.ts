import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { runs, userPreferences } from "../db/schema";
import { stickerById, stickerIds } from "../lib/stickers";
import { AppError } from "./errors";
import { ownedWrite, type Actor } from "./owned-write";

export const stickerInput = z.object({ id: z.enum(stickerIds) });
export async function chooseSticker(
  actor: Actor,
  input: z.input<typeof stickerInput>,
) {
  const { id } = stickerInput.parse(input);
  if (!actor.runId)
    throw new AppError("RUN_STOPPED", 409, "请在当前回复中选择表情。");
  return ownedWrite(actor, "选择表情", async (tx) => {
    const [run] = await tx
      .select()
      .from(runs)
      .where(and(eq(runs.id, actor.runId!), eq(runs.userId, actor.userId)));
    const [pref] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, actor.userId));
    if (pref?.stickersEnabled === false || !["web", "qq"].includes(run.source))
      throw new AppError(
        "STICKER_DISABLED",
        409,
        "当前聊天不使用表情包，请用文字回复。",
      );
    if (run.stickerId) {
      if (run.stickerId !== id)
        throw new AppError("STICKER_LIMIT", 409, "每轮最多一张表情。");
      return stickerById(id);
    }
    const [previous] = await tx
      .select({ stickerId: runs.stickerId })
      .from(runs)
      .where(
        and(
          eq(runs.userId, actor.userId),
          eq(runs.status, "completed"),
          isNull(runs.clearedAt),
          sql`(${runs.createdAt}, ${runs.id}) < (${run.createdAt}, ${run.id}::uuid)`,
        ),
      )
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(1);
    if (previous?.stickerId === id)
      throw new AppError(
        "STICKER_REPEAT",
        409,
        "刚用过这张表情，请换一张或只回复文字。",
      );
    await tx
      .update(runs)
      .set({ stickerId: id, updatedAt: new Date() })
      .where(eq(runs.id, run.id));
    return stickerById(id);
  });
}
