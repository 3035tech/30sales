CREATE TYPE "public"."campaign_draft_status" AS ENUM('draft');--> statement-breakpoint
CREATE TABLE "campaign_drafts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"window_start" text NOT NULL,
	"window_end" text NOT NULL,
	"time_zone" text NOT NULL,
	"daily_message_limit" integer NOT NULL,
	"minimum_delay_seconds" integer NOT NULL,
	"status" "campaign_draft_status" DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_drafts_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "campaign_drafts_name_length_check" CHECK (length("campaign_drafts"."name") between 2 and 120),
	CONSTRAINT "campaign_drafts_window_start_check" CHECK ("campaign_drafts"."window_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "campaign_drafts_window_end_check" CHECK ("campaign_drafts"."window_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "campaign_drafts_window_order_check" CHECK ("campaign_drafts"."window_start" < "campaign_drafts"."window_end"),
	CONSTRAINT "campaign_drafts_daily_limit_check" CHECK ("campaign_drafts"."daily_message_limit" between 1 and 500),
	CONSTRAINT "campaign_drafts_minimum_delay_check" CHECK ("campaign_drafts"."minimum_delay_seconds" between 5 and 300),
	CONSTRAINT "campaign_drafts_time_zone_length_check" CHECK (length("campaign_drafts"."time_zone") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_drafts_org_created_idx" ON "campaign_drafts" USING btree ("organization_id","created_at");