import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  CHANNEL_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  MODEL_BASE_URL: z.string().optional(),
  MODEL_API_KEY: z.string().optional(),
  MODEL_NAME: z.string().optional(),
  DAILY_POINT_LIMIT: z.coerce.number().int().min(1).max(1000000).default(100),
  ADMIN_EMAIL: z.union([z.email(), z.literal("")]).default(""),
  ILINK_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  QQ_ENABLED: z.string().default("false").transform((v) => v === "true"),
  QQ_APP_ID: z.string().optional(),
  QQ_APP_SECRET: z.string().optional(),
  QQ_BOT_URL: z.union([z.url({ protocol: /^https$/ }), z.literal("")]).optional(),
}).superRefine((env, ctx) => {
  if (env.QQ_ENABLED) {
    for (const key of ["QQ_APP_ID", "QQ_APP_SECRET"] as const)
      if (!env[key]?.trim()) ctx.addIssue({ code: "custom", path: [key], message: "Required when QQ is enabled" });
  }
});
let cached: z.infer<typeof schema> | undefined;
export function config() {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Missing or invalid server configuration: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  cached = result.data;
  return cached;
}
export const modelConfigured = () =>
  Boolean(
    config().MODEL_BASE_URL && config().MODEL_API_KEY && config().MODEL_NAME,
  );
