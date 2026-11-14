CREATE TABLE "external_records" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"record_type" text NOT NULL,
	"external_id" text NOT NULL,
	"account_id" uuid,
	"person_id" uuid,
	"lead_id" uuid,
	"opportunity_id" uuid,
	"source_updated_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" text,
	CONSTRAINT "external_records_org_provider_type_external_unique" UNIQUE("organization_id","provider","record_type","external_id"),
	CONSTRAINT "external_records_single_entity_check" CHECK (num_nonnulls("external_records"."account_id", "external_records"."person_id", "external_records"."lead_id", "external_records"."opportunity_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_account_tenant_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."accounts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_person_tenant_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_lead_tenant_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "external_records_org_provider_idx" ON "external_records" USING btree ("organization_id","provider");