ALTER TABLE "conversations" ADD COLUMN "conversation_type" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider_recipient_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_type_check" CHECK ("conversations"."conversation_type" in ('direct', 'group'));