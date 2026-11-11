CREATE TABLE "agent_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "agent_device_id" uuid;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "agent_device_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_devices" ADD CONSTRAINT "agent_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_device_id_agent_devices_id_fk" FOREIGN KEY ("agent_device_id") REFERENCES "public"."agent_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_agent_device_id_agent_devices_id_fk" FOREIGN KEY ("agent_device_id") REFERENCES "public"."agent_devices"("id") ON DELETE set null ON UPDATE no action;