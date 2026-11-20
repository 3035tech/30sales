ALTER TABLE "messaging_channels" DROP CONSTRAINT "messaging_channels_org_phone_unique";--> statement-breakpoint
ALTER TABLE "messaging_channels" DROP CONSTRAINT "messaging_channels_org_provider_channel_unique";--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channels_org_phone_unique" ON "messaging_channels" USING btree ("organization_id","phone_number") WHERE "messaging_channels"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_channels_org_provider_channel_unique" ON "messaging_channels" USING btree ("organization_id","provider","provider_channel_id") WHERE "messaging_channels"."deleted_at" is null;