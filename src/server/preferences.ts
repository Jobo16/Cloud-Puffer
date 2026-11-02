import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { userPreferences } from "../db/schema";
import { ownedWrite } from "./owned-write";

export const preferencesInput = z
  .object({
    agentName: z.string().trim().min(1).max(40),
    systemPrompt: z.string().trim().max(4000),
    tasksEnabled: z.boolean(),
    memoryEnabled: z.boolean(),
    stickersEnabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, "请至少修改一项配置。");
function publicPreferences(row?: typeof userPreferences.$inferSelect) {
  return {
    agentName: row?.agentName ?? "JOJO",
    systemPrompt: row?.systemPrompt ?? "",
    tasksEnabled: row?.tasksEnabled ?? true,
    memoryEnabled: row?.memoryEnabled ?? true,
    stickersEnabled: row?.stickersEnabled ?? true,
  };
}
export async function preferences(userId: string) {
  const [row] = await db()
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return publicPreferences(row);
}
export async function updatePreferences(
  userId: string,
  input: z.input<typeof preferencesInput>,
) {
  const data = preferencesInput.parse(input);
  return ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "更新助手配置",
    async (tx) => {
      const [saved] = await tx
        .insert(userPreferences)
        .values({ userId, ...data })
        .onConflictDoUpdate({ target: userPreferences.userId, set: data })
        .returning();
      return publicPreferences(saved);
    },
  );
}
