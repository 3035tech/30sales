ALTER TABLE "conversations" ADD COLUMN "provider_archived" boolean;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider_pinned" boolean;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider_unread_count" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "provider_deleted" boolean;