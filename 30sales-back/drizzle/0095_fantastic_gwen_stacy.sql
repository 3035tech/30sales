CREATE TYPE "public"."account_industry" AS ENUM('education', 'sports', 'vehicle_rental', 'professional_services', 'retail', 'hospitality', 'nonprofit', 'other');--> statement-breakpoint
CREATE TYPE "public"."opportunity_creation_mode" AS ENUM('human', 'ai', 'import', 'system');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "industry" "account_industry";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "created_by_type" "opportunity_creation_mode" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "student_count_snapshot" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "employee_count_snapshot" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "quoted_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "quoted_currency" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "quoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_employee_count_check" CHECK ("accounts"."employee_count" is null or "accounts"."employee_count" >= 0);