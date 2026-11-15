CREATE TABLE "closer_event_sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"target_minutes" integer NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closer_event_sla_policies_org_type_unique" UNIQUE("organization_id","event_type"),
	CONSTRAINT "closer_event_sla_policies_event_type_check" CHECK ("closer_event_sla_policies"."event_type" in ('qualified_handoff', 'human_requested', 'buying_intent', 'closer_question', 'lead_replied_after_handoff', 'interpretation_failure')),
	CONSTRAINT "closer_event_sla_policies_target_minutes_check" CHECK ("closer_event_sla_policies"."target_minutes" between 1 and 10080)
);
--> statement-breakpoint
ALTER TABLE "closer_events" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "closer_event_sla_policies" ADD CONSTRAINT "closer_event_sla_policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_event_sla_policies" ADD CONSTRAINT "closer_event_sla_policies_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "closer_events_org_assignee_status_due_idx" ON "closer_events" USING btree ("organization_id","assigned_to_user_id","status","due_at");