CREATE TABLE "opportunity_proposals" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"billing_term" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_proposals_version_unique" UNIQUE("organization_id","opportunity_id","version"),
	CONSTRAINT "opportunity_proposals_billing_term_check" CHECK ("opportunity_proposals"."billing_term" in ('monthly', 'quarterly', 'annual', 'one_time')),
	CONSTRAINT "opportunity_proposals_currency_check" CHECK ("opportunity_proposals"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "opportunity_proposals_file_size_check" CHECK ("opportunity_proposals"."file_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "opportunity_proposals" ADD CONSTRAINT "opportunity_proposals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_proposals" ADD CONSTRAINT "opportunity_proposals_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_proposals" ADD CONSTRAINT "opportunity_proposals_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_proposals_org_opportunity_created_idx" ON "opportunity_proposals" USING btree ("organization_id","opportunity_id","created_at");