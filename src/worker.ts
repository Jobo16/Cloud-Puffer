import { eq } from "drizzle-orm";
import { pool, db } from "./db";
import { runs } from "./db/schema";
import { config } from "./server/config";
import { AGENT_QUEUE, createWorkerQueue } from "./server/queue";
import { executeRun } from "./server/agent";
import { deliverRun, superviseChannels } from "./server/ilink";
import { createQqBot, deliverQqRun } from "./server/qq";
import { expireLocalRuns } from "./server/agent-devices";

// This first increment intentionally supports one shared worker, with four concurrent users.
// The DB lease prevents an accidental second worker from polling the same iLink accounts.
const lease = await pool().connect();
const {
  rows: [lock],
} = await lease.query("SELECT pg_try_advisory_lock(742199320) AS acquired");
if (!lock.acquired) {
  lease.release();
  await pool().end();
  throw new Error("A Cloud Puffer worker is already running for this database.");
}
const controller = new AbortController();
const boss = createWorkerQueue();
let channelTask: Promise<void> | undefined;
let qqTask: Promise<void> | undefined;
const qqBot = createQqBot();
let stopping = false;
const localRunSweep = setInterval(() => {
  void expireLocalRuns().catch(() => console.error("local_run_sweep_failed"));
}, 30_000);
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  clearInterval(localRunSweep);
  controller.abort();
  await channelTask;
  await qqTask;
  await boss.stop({ graceful: true, timeout: 150000 });
  await lease.query("SELECT pg_advisory_unlock(742199320)");
  lease.release();
  await pool().end();
  process.exit(0);
};
lease.on("error", () => {
  console.error("worker_lease_lost");
  process.exit(1);
});
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
await db()
  .update(runs)
  .set({
    deliveryStatus: "unknown",
    deliveryError: "INTERRUPTED",
    updatedAt: new Date(),
  })
  .where(eq(runs.deliveryStatus, "submitting"));
await boss.start();
await boss.work<{ runId: string }>(
  AGENT_QUEUE,
  { localConcurrency: 4, pollingIntervalSeconds: 0.5 },
  async ([job]) => {
    await executeRun(job.data.runId);
    await deliverRun(job.data.runId);
    await deliverQqRun(job.data.runId, qqBot);
  },
);
if (config().ILINK_ENABLED)
  channelTask = superviseChannels(controller.signal).catch(() => {
    console.error("channel_supervisor_stopped");
    void shutdown();
  });
if (qqBot)
  qqTask = qqBot.start(controller.signal).catch(() => {
    // QQ configuration/connectivity must not take down web and WeChat processing.
    console.error(
      "qq_gateway_stopped; check QQ configuration and restart the worker",
    );
  });
console.log(
  "Cloud Puffer worker ready; four concurrent users, ordered turns per user.",
);
