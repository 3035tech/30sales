ALTER TYPE "public"."campaign_draft_status" ADD VALUE 'active';--> statement-breakpoint
ALTER TYPE "public"."campaign_draft_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."campaign_draft_status" ADD VALUE 'paused';--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD COLUMN "opening_message" text DEFAULT 'Olá! Tudo bem? Gostaria de conversar com você.' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_opening_message_length_check" CHECK (length("campaign_drafts"."opening_message") between 1 and 4096);