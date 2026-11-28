ALTER TABLE "conversation_tag_links" ADD COLUMN "origin" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD COLUMN "provider_label_id" text;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD COLUMN "provider_sync_state" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_origin_check" CHECK ("conversation_tag_links"."origin" in ('local', 'whatsapp', 'both'));--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_provider_sync_state_check" CHECK ("conversation_tag_links"."provider_sync_state" in ('local', 'provider_accepted', 'provider_confirmed', 'failed'));