CREATE TABLE "campaign_draft_channels" (
	"organization_id" uuid NOT NULL,
	"campaign_draft_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "campaign_draft_channels_pk" PRIMARY KEY("organization_id","campaign_draft_id","channel_id"),
	CONSTRAINT "campaign_draft_channels_order_unique" UNIQUE("organization_id","campaign_draft_id","position"),
	CONSTRAINT "campaign_draft_channels_position_check" CHECK ("campaign_draft_channels"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_draft_channels" ADD CONSTRAINT "campaign_draft_channels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_draft_channels" ADD CONSTRAINT "campaign_draft_channels_draft_tenant_fk" FOREIGN KEY ("campaign_draft_id","organization_id") REFERENCES "public"."campaign_drafts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_draft_channels" ADD CONSTRAINT "campaign_draft_channels_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_draft_channels_org_channel_idx" ON "campaign_draft_channels" USING btree ("organization_id","channel_id");