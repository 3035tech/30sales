CREATE TABLE "agent_settings" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT 'claude-haiku-4-5-20251001' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_settings_org_agent_unique" UNIQUE("organization_id","agent_key"),
	CONSTRAINT "agent_settings_agent_key_check" CHECK ("agent_settings"."agent_key" in ('assistant')),
	CONSTRAINT "agent_settings_model_check" CHECK ("agent_settings"."model" in ('claude-haiku-4-5-20251001')),
	CONSTRAINT "agent_settings_prompt_length_check" CHECK (length("agent_settings"."system_prompt") <= 30000)
);
--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_settings_org_enabled_idx" ON "agent_settings" USING btree ("organization_id","enabled");