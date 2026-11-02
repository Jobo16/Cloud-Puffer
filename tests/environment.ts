// Tests always use their own database, never .env or the development user's data.
export const testEnvironment = {
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ||
    "postgresql://jojobot:local-development-only@127.0.0.1:55439/jojobot_test",
  BETTER_AUTH_URL: "http://localhost:3031",
  BETTER_AUTH_SECRET: "test-only-auth-secret-never-use-in-production",
  CHANNEL_ENCRYPTION_KEY: "a".repeat(64),
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "11025",
  MAIL_FROM: "Tests <tests@jojobot.local>",
  MODEL_BASE_URL: "http://127.0.0.1:9/v1",
  MODEL_API_KEY: "test-only",
  MODEL_NAME: "fixture",
  DAILY_MESSAGE_LIMIT: "4",
  ILINK_ENABLED: "true",
  QQ_ENABLED: "true",
  QQ_APP_ID: "qq-test-app",
  QQ_APP_SECRET: "qq-test-secret",
  QQ_BOT_URL: "",
};
if (new URL(testEnvironment.DATABASE_URL).pathname !== "/jojobot_test")
  throw new Error("Tests require the dedicated jojobot_test database.");
