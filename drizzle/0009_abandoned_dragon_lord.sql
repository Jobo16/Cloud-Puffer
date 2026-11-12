ALTER TABLE "user_preferences" ALTER COLUMN "agent_name" SET DEFAULT 'Cloud Puffer';--> statement-breakpoint
UPDATE "user_preferences" SET "agent_name" = 'Cloud Puffer' WHERE "agent_name" = '小肥鱼';
