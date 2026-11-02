import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const template = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
const env = template
  .replace(
    "BETTER_AUTH_SECRET=",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}`,
  )
  .replace(
    "CHANNEL_ENCRYPTION_KEY=",
    `CHANNEL_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
  );
try {
  await writeFile(new URL("../.env", import.meta.url), env, {
    flag: "wx",
    mode: 0o600,
  });
  console.log("Created private .env. Model access remains unconfigured.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing .env preserved.");
}
