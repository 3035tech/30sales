CREATE TYPE "public"."media_attachment_provider" AS ENUM('evolution', 'whatsapp_cloud_api');--> statement-breakpoint
CREATE TYPE "public"."media_attachment_status" AS ENUM('pending', 'processing', 'available', 'failed');--> statement-breakpoint
CREATE TYPE "public"."media_attachment_type" AS ENUM('image', 'video', 'audio', 'document', 'sticker');--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider" "media_attachment_provider" NOT NULL,
	"media_type" "media_attachment_type" NOT NULL,
	"source_media_id" text,
	"source_ciphertext" text,
	"source_iv" text,
	"source_auth_tag" text,
	"mime_type" text,
	"file_name" text,
	"size_bytes" integer,
	"sha256" text,
	"storage_key" text,
	"status" "media_attachment_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_attachments_message_tenant_unique" UNIQUE("message_id","organization_id"),
	CONSTRAINT "message_attachments_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "message_attachments_size_check" CHECK ("message_attachments"."size_bytes" is null or "message_attachments"."size_bytes" between 0 and 1073741824)
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_tenant_fk" FOREIGN KEY ("message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_attachments_org_status_available_idx" ON "message_attachments" USING btree ("organization_id","status","available_at");--> statement-breakpoint
CREATE INDEX "message_attachments_org_message_idx" ON "message_attachments" USING btree ("organization_id","message_id");