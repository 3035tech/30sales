CREATE TYPE "public"."lead_qualification_fact_source" AS ENUM('manual', 'conversation', 'import', 'enrichment');--> statement-breakpoint
CREATE TYPE "public"."lead_qualification_fact_state" AS ENUM('confirmed', 'unknown', 'not_applicable', 'conflict', 'estimate');--> statement-breakpoint
CREATE TABLE "lead_qualification_facts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"fact_key" text NOT NULL,
	"value" text,
	"state" "lead_qualification_fact_state" NOT NULL,
	"source" "lead_qualification_fact_source" DEFAULT 'manual' NOT NULL,
	"evidence" text,
	"source_message_id" uuid,
	"confidence" numeric(4, 3),
	"created_by_user_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_qualification_facts_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "lead_qualification_facts_key_check" CHECK (length("lead_qualification_facts"."fact_key") between 2 and 64 and "lead_qualification_facts"."fact_key" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "lead_qualification_facts_value_check" CHECK (("lead_qualification_facts"."state" in ('unknown', 'not_applicable') and "lead_qualification_facts"."value" is null) or ("lead_qualification_facts"."state" not in ('unknown', 'not_applicable') and "lead_qualification_facts"."value" is not null and length(trim("lead_qualification_facts"."value")) > 0)),
	CONSTRAINT "lead_qualification_facts_source_check" CHECK (("lead_qualification_facts"."source" = 'conversation' and "lead_qualification_facts"."source_message_id" is not null) or ("lead_qualification_facts"."source" <> 'conversation' and "lead_qualification_facts"."source_message_id" is null)),
	CONSTRAINT "lead_qualification_facts_confidence_check" CHECK ("lead_qualification_facts"."confidence" is null or "lead_qualification_facts"."confidence" between 0 and 1),
	CONSTRAINT "lead_qualification_facts_evidence_length_check" CHECK ("lead_qualification_facts"."evidence" is null or length("lead_qualification_facts"."evidence") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "lead_qualification_facts" ADD CONSTRAINT "lead_qualification_facts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualification_facts" ADD CONSTRAINT "lead_qualification_facts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualification_facts" ADD CONSTRAINT "lead_qualification_facts_lead_tenant_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_qualification_facts" ADD CONSTRAINT "lead_qualification_facts_message_tenant_fk" FOREIGN KEY ("source_message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_qualification_facts_org_lead_recorded_idx" ON "lead_qualification_facts" USING btree ("organization_id","lead_id","recorded_at");