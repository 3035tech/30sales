CREATE TABLE "closer_events" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"idempotency_key" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"source_message_id" uuid NOT NULL,
	"assigned_to_user_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"evidence" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closer_events_org_idempotency_unique" UNIQUE("organization_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closer_events" ADD CONSTRAINT "closer_events_message_tenant_fk" FOREIGN KEY ("source_message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "closer_events_org_assignee_status_time_idx" ON "closer_events" USING btree ("organization_id","assigned_to_user_id","status","occurred_at");