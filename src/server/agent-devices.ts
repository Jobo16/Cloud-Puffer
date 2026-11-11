import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db, transaction } from "../db";
import { agentDevices, runs, user, userPreferences } from "../db/schema";
import { AppError } from "./errors";
import { AGENT_QUEUE, queue } from "./queue";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const deviceKind = z.enum(["codex", "openclaw"]);

export async function listAgentDevices(userId: string) {
  const [devices, selection] = await Promise.all([
    db()
      .select({
        id: agentDevices.id,
        kind: agentDevices.kind,
        lastSeenAt: agentDevices.lastSeenAt,
        createdAt: agentDevices.createdAt,
      })
      .from(agentDevices)
      .where(
        and(eq(agentDevices.userId, userId), isNull(agentDevices.revokedAt)),
      ),
    db()
      .select({ id: userPreferences.agentDeviceId })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
  ]);
  return {
    selected: selection[0]?.id ?? null,
    devices: devices.map((device) => ({
      ...device,
      online: Boolean(
        device.lastSeenAt && device.lastSeenAt.getTime() > Date.now() - 30_000,
      ),
    })),
  };
}

export async function createAgentDevice(
  userId: string,
  kind: z.infer<typeof deviceKind>,
) {
  const token = randomBytes(32).toString("base64url");
  const device = await transaction(async (tx) => {
    const [owner] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .for("update");
    if (!owner) throw new AppError("UNAUTHORIZED", 401, "请先登录。");
    const existing = await tx
      .select({ id: agentDevices.id })
      .from(agentDevices)
      .where(
        and(eq(agentDevices.userId, userId), isNull(agentDevices.revokedAt)),
      )
      .limit(5);
    if (existing.length >= 5)
      throw new AppError(
        "DEVICE_LIMIT",
        429,
        "最多连接五台设备，请先移除不用的设备。",
      );
    const [created] = await tx
      .insert(agentDevices)
      .values({ userId, kind, tokenHash: hash(token) })
      .returning({ id: agentDevices.id });
    return created;
  });
  return { id: device.id, token };
}

export async function selectAgentDevice(userId: string, id: string | null) {
  if (id) {
    const [device] = await db()
      .select({ id: agentDevices.id })
      .from(agentDevices)
      .where(
        and(
          eq(agentDevices.id, id),
          eq(agentDevices.userId, userId),
          isNull(agentDevices.revokedAt),
        ),
      );
    if (!device)
      throw new AppError("DEVICE_NOT_FOUND", 404, "找不到这台设备。");
  }
  await db()
    .insert(userPreferences)
    .values({ userId, agentDeviceId: id })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { agentDeviceId: id },
    });
  return listAgentDevices(userId);
}

export async function revokeAgentDevice(userId: string, id: string) {
  await transaction(async (tx, client) => {
    await tx
      .update(agentDevices)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentDevices.id, id), eq(agentDevices.userId, userId)));
    await tx
      .update(userPreferences)
      .set({ agentDeviceId: null })
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.agentDeviceId, id),
        ),
      );
    const pending = await tx
      .update(runs)
      .set({
        status: "failed",
        errorCode: "LOCAL_AGENT_FAILED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(runs.agentDeviceId, id),
          eq(runs.userId, userId),
          inArray(runs.status, ["queued", "running"]),
        ),
      )
      .returning({ id: runs.id });
    for (const run of pending)
      await queue().send(
        AGENT_QUEUE,
        { runId: run.id },
        {
          singletonKey: userId,
          db: { executeSql: (text, values) => client.query(text, values) },
        },
      );
  });
  return listAgentDevices(userId);
}

export async function authenticatedDevice(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) throw new AppError("UNAUTHORIZED", 401, "设备认证失败。");
  const [device] = await db()
    .select()
    .from(agentDevices)
    .where(eq(agentDevices.tokenHash, hash(token)));
  if (!device || device.revokedAt)
    throw new AppError("UNAUTHORIZED", 401, "设备认证失败。");
  await db()
    .update(agentDevices)
    .set({ lastSeenAt: new Date() })
    .where(eq(agentDevices.id, device.id));
  return device;
}

export async function expireLocalRuns() {
  const stale = await db()
    .select({ id: runs.id, userId: runs.userId })
    .from(runs)
    .where(
      and(
        eq(runs.status, "running"),
        isNotNull(runs.agentDeviceId),
        lt(runs.updatedAt, new Date(Date.now() - 120_000)),
      ),
    );
  for (const candidate of stale)
    await transaction(async (tx, client) => {
      const [run] = await tx
        .update(runs)
        .set({
          status: "failed",
          errorCode: "INTERRUPTED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(runs.id, candidate.id),
            eq(runs.status, "running"),
            isNotNull(runs.agentDeviceId),
            lt(runs.updatedAt, new Date(Date.now() - 120_000)),
          ),
        )
        .returning({
          id: runs.id,
          userId: runs.userId,
          agentDeviceId: runs.agentDeviceId,
        });
      if (!run?.agentDeviceId) return;
      await queue().send(
        AGENT_QUEUE,
        { runId: run.id },
        {
          singletonKey: run.userId,
          db: { executeSql: (text, values) => client.query(text, values) },
        },
      );
    });
}
