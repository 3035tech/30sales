CREATE TABLE "campaign_draft_audiences" (
	"organization_id" uuid NOT NULL,
	"campaign_draft_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"selected_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_draft_audiences_pk" PRIMARY KEY("organization_id","campaign_draft_id","lead_id")
);
--> statement-breakpoint
ALTER TABLE "campaign_draft_audiences" ADD CONSTRAINT "campaign_draft_audiences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_draft_audiences" ADD CONSTRAINT "campaign_draft_audiences_selected_by_user_id_user_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_draft_audiences" ADD CONSTRAINT "campaign_draft_audiences_draft_tenant_fk" FOREIGN KEY ("campaign_draft_id","organization_id") REFERENCES "public"."campaign_drafts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_draft_audiences" ADD CONSTRAINT "campaign_draft_audiences_lead_tenant_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_draft_audiences_org_draft_idx" ON "campaign_draft_audiences" USING btree ("organization_id","campaign_draft_id","created_at");