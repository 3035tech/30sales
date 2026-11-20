CREATE TABLE "assistant_profiles" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_line_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model" text DEFAULT 'claude-haiku-5-5' NOT NULL,
	"transcribe_audio" boolean DEFAULT false NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_profiles_id_tenant_line_unique" UNIQUE("id","organization_id","business_line_id"),
	CONSTRAINT "assistant_profiles_direction_check" CHECK ("assistant_profiles"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "assistant_profiles_name_check" CHECK (length(trim("assistant_profiles"."name")) between 2 and 120),
	CONSTRAINT "assistant_profiles_model_check" CHECK ("assistant_profiles"."model" in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')),
	CONSTRAINT "assistant_profiles_prompt_length_check" CHECK (length("assistant_profiles"."system_prompt") <= 30000),
	CONSTRAINT "assistant_profiles_enabled_prompt_check" CHECK (not "assistant_profiles"."enabled" or length(trim("assistant_profiles"."system_prompt")) >= 100)
);
--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "inbound_assistant_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "outbound_assistant_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_business_line_tenant_fk" FOREIGN KEY ("organization_id","business_line_id") REFERENCES "public"."business_lines"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_profiles_line_direction_name_unique" ON "assistant_profiles" USING btree ("organization_id","business_line_id","direction",lower("name"));--> statement-breakpoint
CREATE INDEX "assistant_profiles_line_direction_enabled_idx" ON "assistant_profiles" USING btree ("organization_id","business_line_id","direction","enabled");--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_inbound_profile_scope_fk" FOREIGN KEY ("inbound_assistant_profile_id","organization_id","business_line_id") REFERENCES "public"."assistant_profiles"("id","organization_id","business_line_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_outbound_profile_scope_fk" FOREIGN KEY ("outbound_assistant_profile_id","organization_id","business_line_id") REFERENCES "public"."assistant_profiles"("id","organization_id","business_line_id") ON DELETE restrict ON UPDATE no action;