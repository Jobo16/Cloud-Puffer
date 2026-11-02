ALTER TABLE "user_preferences" ADD COLUMN "agent_name" text DEFAULT 'JOJO' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "persona" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "tasks_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "memory_enabled" boolean DEFAULT true NOT NULL;