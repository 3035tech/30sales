ALTER TABLE "closer_event_sla_policies" ADD COLUMN "escalate_to_managers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "closer_events" ADD COLUMN "sla_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_id_organization_unique" UNIQUE("id","organization_id");