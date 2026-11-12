import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ModelMessage } from "ai";

const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  dailyPointLimit: integer("daily_point_limit"),
  createdAt: created(),
  updatedAt: updated(),
});
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: created(),
    updatedAt: updated(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export type ToolActivity = {
  id: string;
  name: string;
  label: string;
  status: "running" | "completed" | "failed";
  result?: unknown;
};
export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: created(),
});
export const agentDevices = pgTable("agent_devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"codex" | "openclaw">().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: created(),
});
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    source: text("source").$type<"web" | "wechat" | "qq" | "telegram">().notNull(),
    input: text("input").notNull(),
    output: text("output").default("").notNull(),
    stickerId: text("sticker_id"),
    status: text("status")
      .$type<"queued" | "running" | "completed" | "failed" | "cancelled">()
      .default("queued")
      .notNull(),
    activities: jsonb("activities")
      .$type<ToolActivity[]>()
      .default([])
      .notNull(),
    modelMessages: jsonb("model_messages")
      .$type<ModelMessage[]>()
      .default([])
      .notNull(),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    channelId: uuid("channel_id"),
    agentDeviceId: uuid("agent_device_id").references(() => agentDevices.id, {
      onDelete: "set null",
    }),
    contextToken: text("context_token"),
    deliveryStatus: text("delivery_status")
      .$type<
        | "not_sent"
        | "pending"
        | "submitting"
        | "accepted"
        | "partial"
        | "unknown"
        | "failed"
      >()
      .default("not_sent")
      .notNull(),
    deliveryError: text("delivery_error"),
    createdAt: created(),
    updatedAt: updated(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("run_request_unique").on(t.userId, t.source, t.requestKey),
    index("run_user_date_idx").on(t.userId, t.createdAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    title: text("title").notNull(),
    notes: text("notes").default("").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completed: boolean("completed").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("task_request_unique").on(t.userId, t.requestKey),
    index("task_user_idx").on(t.userId),
  ],
);
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    content: text("content").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("memory_request_unique").on(t.userId, t.requestKey),
    index("memory_user_idx").on(t.userId),
  ],
);
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  stickersEnabled: boolean("stickers_enabled").default(true).notNull(),
  agentName: text("agent_name").default("小肥鱼").notNull(),
  systemPrompt: text("system_prompt").default("").notNull(),
  tasksEnabled: boolean("tasks_enabled").default(true).notNull(),
  memoryEnabled: boolean("memory_enabled").default(true).notNull(),
  agentDeviceId: uuid("agent_device_id").references(() => agentDevices.id, {
    onDelete: "set null",
  }),
});
// A platform-owned QQ application serves many users. Each private sender binds to one owner.
export const qqConnections = pgTable(
  "qq_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    appId: text("app_id").notNull(),
    peerId: text("peer_id").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("qq_sender_unique").on(t.appId, t.peerId)],
);
export const qqBindings = pgTable("qq_bindings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  appId: text("app_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const telegramConnections = pgTable(
  "telegram_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    botId: text("bot_id").notNull(),
    peerId: text("peer_id").notNull(),
    chatId: text("chat_id").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("telegram_sender_unique").on(t.botId, t.peerId)],
);
export const telegramBindings = pgTable("telegram_bindings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  botId: text("bot_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  botId: text("bot_id").notNull().unique(),
  peerId: text("peer_id").notNull().unique(),
  tokenCipher: text("token_cipher").notNull(),
  baseUrl: text("base_url").notNull(),
  status: text("status")
    .$type<"connected" | "error">()
    .default("connected")
    .notNull(),
  cursor: text("cursor").default("").notNull(),
  lastError: text("last_error"),
  createdAt: created(),
  updatedAt: updated(),
});
export const bindings = pgTable(
  "bindings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    qrCode: text("qr_code").notNull(),
    image: text("image").notNull(),
    baseUrl: text("base_url")
      .default("https://ilinkai.weixin.qq.com")
      .notNull(),
    status: text("status").default("wait").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (t) => [index("binding_user_idx").on(t.userId)],
);
