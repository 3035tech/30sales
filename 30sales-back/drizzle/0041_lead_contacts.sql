CREATE TABLE "lead_contacts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"job_title" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_interested" boolean DEFAULT false NOT NULL,
	"referral_note" text,
	"notes" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_contacts_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "lead_contacts_lead_person_unique" UNIQUE("lead_id","person_id"),
	CONSTRAINT "lead_contacts_job_title_length_check" CHECK ("lead_contacts"."job_title" is null or length("lead_contacts"."job_title") <= 120),
	CONSTRAINT "lead_contacts_referral_note_length_check" CHECK ("lead_contacts"."referral_note" is null or length("lead_contacts"."referral_note") <= 500),
	CONSTRAINT "lead_contacts_notes_length_check" CHECK ("lead_contacts"."notes" is null or length("lead_contacts"."notes") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_lead_tenant_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_person_tenant_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_contacts_primary_unique" ON "lead_contacts" USING btree ("organization_id","lead_id") WHERE "lead_contacts"."is_primary";--> statement-breakpoint
CREATE INDEX "lead_contacts_org_lead_idx" ON "lead_contacts" USING btree ("organization_id","lead_id");