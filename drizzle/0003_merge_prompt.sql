ALTER TABLE "user_preferences" ADD COLUMN "system_prompt" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "user_preferences" SET "system_prompt" = concat_ws(E'\n\n', nullif(trim("persona"), ''), nullif(trim("instructions"), ''));--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "persona";--> statement-breakpoint
ALTER TABLE "user_preferences" DROP COLUMN "instructions";
