CREATE TABLE "campaign_no_send_dates" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_no_send_dates_org_date_unique" UNIQUE("organization_id","date"),
	CONSTRAINT "campaign_no_send_dates_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "campaign_no_send_dates_name_length_check" CHECK (length("campaign_no_send_dates"."name") between 2 and 100)
);
--> statement-breakpoint
ALTER TABLE "campaign_no_send_dates" ADD CONSTRAINT "campaign_no_send_dates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_no_send_dates" ADD CONSTRAINT "campaign_no_send_dates_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_no_send_dates_org_date_idx" ON "campaign_no_send_dates" USING btree ("organization_id","date");