CREATE TYPE "public"."handoff_event_type" AS ENUM('requested', 'accepted', 'returned');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('requested', 'accepted', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "handoff_history" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"handoff_id" uuid NOT NULL,
	"event" "handoff_event_type" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"status" "handoff_status" DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"evidence" text NOT NULL,
	"confirmed_facts" jsonb NOT NULL,
	"unknowns" jsonb NOT NULL,
	"next_step" text NOT NULL,
	"next_step_at" timestamp with time zone NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"accepted_by_user_id" uuid,
	"return_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "handoffs_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"primary_person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'qualification' NOT NULL,
	"owner_user_id" uuid,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "opportunities_org_lead_unique" UNIQUE("organization_id","lead_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "assigned_to_user_id" uuid;--> statement-breakpoint
ALTER TABLE "handoff_history" ADD CONSTRAINT "handoff_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_history" ADD CONSTRAINT "handoff_history_handoff_tenant_fk" FOREIGN KEY ("handoff_id","organization_id") REFERENCES "public"."handoffs"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_lead_tenant_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_account_tenant_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."accounts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_person_tenant_fk" FOREIGN KEY ("primary_person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "handoff_history_org_handoff_idx" ON "handoff_history" USING btree ("organization_id","handoff_id","occurred_at");--> statement-breakpoint
CREATE INDEX "handoffs_org_status_requested_idx" ON "handoffs" USING btree ("organization_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "opportunities_org_stage_updated_idx" ON "opportunities" USING btree ("organization_id","stage","updated_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_org_assignee_status_due_idx" ON "tasks" USING btree ("organization_id","assigned_to_user_id","status","due_at");
