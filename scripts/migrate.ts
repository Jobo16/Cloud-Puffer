import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgBoss } from "pg-boss";
import { pool } from "../src/db";
import { config } from "../src/server/config";
import { AGENT_QUEUE } from "../src/server/queue";

// All current migrations are additive. A short lock timeout aborts instead of blocking live traffic.
const client = await pool().connect();
try {
  await client.query("SET lock_timeout = '3s'");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
} finally {
  client.release();
}
const queueUrl = new URL(config().DATABASE_URL);
queueUrl.searchParams.set(
  "options",
  `${queueUrl.searchParams.get("options") ?? ""} -c lock_timeout=3000`.trim(),
);
const boss = new PgBoss({
  connectionString: queueUrl.toString(),
  supervise: false,
  schedule: false,
});
boss.on("error", () => console.error("queue_migration_error"));
await boss.start();
await boss.createQueue(AGENT_QUEUE, {
  policy: "key_strict_fifo",
  retryLimit: 2,
  retryDelay: 5,
  expireInSeconds: 180,
});
await boss.stop();
await pool().end();
console.log("JOJOBOT database and queue are ready.");
