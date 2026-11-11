import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, transaction } from "@/db";
import { runs } from "@/db/schema";
import { authenticatedDevice } from "@/server/agent-devices";
import { AppError } from "@/server/errors";
import { errorResponse, json, readBody } from "@/server/http";
import { AGENT_QUEUE, queue } from "@/server/queue";
import { modelHistory } from "@/server/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const device = await authenticatedDevice(request);
    const runId = new URL(request.url).searchParams.get("runId");
    if (runId) {
      const id = z.uuid().parse(runId);
      const [run] = await db()
        .select({ status: runs.status })
        .from(runs)
        .where(
          and(
            eq(runs.id, id),
            eq(runs.agentDeviceId, device.id),
            eq(runs.userId, device.userId),
          ),
        );
      if (run?.status === "running")
        await db()
          .update(runs)
          .set({ updatedAt: new Date() })
          .where(eq(runs.id, id));
      return json({ status: run?.status ?? "missing" });
    }
    const run = await transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.agentDeviceId, device.id),
            eq(runs.userId, device.userId),
            eq(runs.status, "queued"),
          ),
        )
        .orderBy(asc(runs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!next) return null;
      const [earlier] = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(
          and(
            eq(runs.userId, device.userId),
            inArray(runs.status, ["queued", "running"]),
            sql`(${runs.createdAt}, ${runs.id}) < (${next.createdAt}, ${next.id}::uuid)`,
          ),
        )
        .limit(1);
      if (earlier) return null;
      await tx
        .update(runs)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(runs.id, next.id));
      return next;
    });
    if (!run) return json({ run: null });
    const history = await modelHistory(device.userId, run.id);
    return json({
      run: { id: run.id, input: run.input, history },
      kind: device.kind,
      deviceId: device.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const resultInput = z.object({
  runId: z.uuid(),
  status: z.enum(["completed", "failed"]),
  output: z.string().max(12_000),
});
export async function POST(request: Request) {
  try {
    const device = await authenticatedDevice(request);
    const data = resultInput.parse(await readBody(request));
    await transaction(async (tx, client) => {
      const [run] = await tx
        .select()
        .from(runs)
        .where(
          and(
            eq(runs.id, data.runId),
            eq(runs.agentDeviceId, device.id),
            eq(runs.userId, device.userId),
          ),
        )
        .for("update");
      if (!run) throw new AppError("RUN_NOT_FOUND", 404, "找不到这次运行。");
      if (run.status === data.status && run.output === data.output) return;
      if (run.status !== "running")
        throw new AppError("RUN_STOPPED", 409, "这次运行已停止。");
      await tx
        .update(runs)
        .set({
          status: data.status,
          output: data.output,
          errorCode: data.status === "failed" ? "LOCAL_AGENT_FAILED" : null,
          updatedAt: new Date(),
        })
        .where(eq(runs.id, run.id));
      await queue().send(
        AGENT_QUEUE,
        { runId: run.id },
        {
          singletonKey: run.userId,
          db: { executeSql: (text, values) => client.query(text, values) },
        },
      );
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
