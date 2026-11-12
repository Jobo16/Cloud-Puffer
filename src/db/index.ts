import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { config } from "../server/config";

type Db = NodePgDatabase<typeof schema>;
const state = globalThis as typeof globalThis & {
  jojobotPool?: Pool;
  jojobotDb?: Db;
};
export function pool() {
  return (state.jojobotPool ??= new Pool({
    connectionString: config().DATABASE_URL,
    max: 12,
    connectionTimeoutMillis: 5000,
  }));
}
export function db() {
  return (state.jojobotDb ??= drizzle(pool(), { schema }));
}

/** Business writes and pg-boss jobs share a commit; neither can be published alone. */
export async function transaction<T>(
  fn: (database: Db, client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool().connect();
  let discardClient = false;
  try {
    await client.query("BEGIN");
    const result = await fn(drizzle(client, { schema }), client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
