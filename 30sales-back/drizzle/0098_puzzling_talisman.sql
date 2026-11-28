ALTER TABLE "people" ADD COLUMN "profile_picture_key" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "profile_picture_mime_type" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "profile_picture_fetched_at" timestamp with time zone;