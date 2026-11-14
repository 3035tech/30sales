CREATE TABLE "messaging_channels" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"provider_channel_id" text NOT NULL,
	"provider_account_id" text,
	"chatwoot_inbox_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_channels_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "messaging_channels_org_phone_unique" UNIQUE("organization_id","phone_number"),
	CONSTRAINT "messaging_channels_org_provider_channel_unique" UNIQUE("organization_id","provider","provider_channel_id"),
	CONSTRAINT "messaging_channels_org_chatwoot_inbox_unique" UNIQUE("organization_id","chatwoot_inbox_id"),
	CONSTRAINT "messaging_channels_provider_check" CHECK ("messaging_channels"."provider" in ('evolution', 'whatsapp_cloud_api')),
	CONSTRAINT "messaging_channels_phone_e164_check" CHECK ("messaging_channels"."phone_number" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "channel_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messaging_channels_org_active_idx" ON "messaging_channels" USING btree ("organization_id","is_active");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_org_channel_last_message_idx" ON "conversations" USING btree ("organization_id","channel_id","last_message_at");