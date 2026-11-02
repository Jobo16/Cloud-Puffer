import { PgBoss } from "pg-boss";
import { config } from "./config";
import { pool } from "../db";

export const AGENT_QUEUE = "agent-turn";
let producer: PgBoss | undefined;
export function queue() {
  // Sending does not start timers or migrate schema inside a Web request.
  return (producer ??= new PgBoss({
    // Queue metadata reads also need a live connection before send(). Reuse our pool;
    // the actual INSERT still uses the caller's transaction through send({ db }).
    db: { executeSql: (text, values) => pool().query(text, values) },
    migrate: false,
    supervise: false,
    schedule: false,
  }));
}
export function createWorkerQueue() {
  const boss = new PgBoss({
    connectionString: config().DATABASE_URL,
    migrate: false,
  });
  boss.on("error", () => console.error("worker_queue_error"));
  return boss;
}
