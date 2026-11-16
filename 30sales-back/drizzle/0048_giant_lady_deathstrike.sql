CREATE TYPE "public"."contact_outreach_basis" AS ENUM('documented_permission', 'existing_relationship', 'organization_policy', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_outreach_decision" AS ENUM('pending', 'approved', 'blocked');--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD COLUMN "outreach_decision" "contact_outreach_decision" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD COLUMN "outreach_basis" "contact_outreach_basis";--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD COLUMN "outreach_evidence" text;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD COLUMN "outreach_reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD COLUMN "outreach_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_outreach_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("outreach_reviewed_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_outreach_evidence_length_check" CHECK ("lead_contacts"."outreach_evidence" is null or length("lead_contacts"."outreach_evidence") <= 2000);--> statement-breakpoint
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_outreach_review_check" CHECK (("lead_contacts"."outreach_decision" = 'pending' and "lead_contacts"."outreach_basis" is null and "lead_contacts"."outreach_evidence" is null and "lead_contacts"."outreach_reviewed_at" is null) or ("lead_contacts"."outreach_decision" <> 'pending' and "lead_contacts"."outreach_basis" is not null and "lead_contacts"."outreach_evidence" is not null and "lead_contacts"."outreach_reviewed_at" is not null));