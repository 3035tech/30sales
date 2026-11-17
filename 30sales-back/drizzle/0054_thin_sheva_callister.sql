ALTER TABLE "messaging_channels" ADD COLUMN "connection_status" text;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "connection_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_connection_status_check" CHECK ("messaging_channels"."connection_status" is null or "messaging_channels"."connection_status" in ('connected', 'connecting', 'disconnected', 'unknown'));
