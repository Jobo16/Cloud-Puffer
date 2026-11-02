import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { userPreferences } from "../db/schema";
import { ownedWrite } from "./owned-write";

export const preferencesInput = z.object({ stickersEnabled: z.boolean() });
export async function preferences(userId: string) {
  const [row] = await db()
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  return { stickersEnabled: row?.stickersEnabled ?? true };
}
export async function updatePreferences(
  userId: string,
  input: z.input<typeof preferencesInput>,
) {
  const data = preferencesInput.parse(input);
  return ownedWrite(
    { userId, operationKey: crypto.randomUUID() },
    "更新聊天偏好",
    async (tx) => {
      await tx
        .insert(userPreferences)
        .values({ userId, ...data })
        .onConflictDoUpdate({ target: userPreferences.userId, set: data });
      return data;
    },
  );
}
