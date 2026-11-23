CREATE TYPE "public"."account_person_status" AS ENUM('active', 'revoked');--> statement-breakpoint
ALTER TABLE "account_people" ADD COLUMN "status" "account_person_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_people" ADD COLUMN "revoked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "account_people" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_people_org_account_status_idx" ON "account_people" USING btree ("organization_id","account_id","status");--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_revocation_check" CHECK (("account_people"."status" = 'active' and "account_people"."revoked_at" is null) or ("account_people"."status" = 'revoked' and "account_people"."revoked_at" is not null));
