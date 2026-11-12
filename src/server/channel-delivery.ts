import { eq } from "drizzle-orm";
import type { Api } from "grammy";
import type { QQBot } from "@tencent-connect/qqbot-nodejs";
import { db } from "../db";
import { runs } from "../db/schema";
import { deliverRun } from "./ilink";
import { deliverQqRun } from "./qq";
import { deliverTelegramRun } from "./telegram";

export async function deliverChannelRun(
  id: string,
  senders: { qq?: QQBot; telegram?: Api },
) {
  const [run] = await db()
    .select({ source: runs.source })
    .from(runs)
    .where(eq(runs.id, id));
  if (run?.source === "wechat") await deliverRun(id);
  if (run?.source === "qq") await deliverQqRun(id, senders.qq);
  if (run?.source === "telegram")
    await deliverTelegramRun(id, senders.telegram);
}
