import { Pool } from "pg";
import { testEnvironment } from "../tests/environment";
Object.assign(process.env, testEnvironment);
const adminUrl = new URL(testEnvironment.DATABASE_URL);
adminUrl.pathname = "/postgres";
const admin = new Pool({ connectionString: adminUrl.toString() });
try {
  const { rowCount } = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = 'jojobot_test'",
  );
  if (!rowCount) await admin.query("CREATE DATABASE jojobot_test");
} finally {
  await admin.end();
}
await import("./migrate");
