ALTER TABLE "conversations" ADD COLUMN "sofia_qualification_intent" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sofia_qualification_summary" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sofia_confirmed_facts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sofia_unknowns" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sofia_next_step" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "sofia_qualification_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "handoffs" ADD COLUMN "requested_by_agent" boolean DEFAULT false NOT NULL;