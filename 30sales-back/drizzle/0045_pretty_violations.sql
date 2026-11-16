CREATE TYPE "public"."account_market_segment" AS ENUM('education', 'sports', 'fitness', 'other');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "market_segment" "account_market_segment";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "student_count" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_student_count_check" CHECK ("accounts"."student_count" is null or "accounts"."student_count" >= 0);