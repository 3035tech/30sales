ALTER TABLE "account_segments" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "account_segments" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "account_segments" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "account_segments" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "address" text;