CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"closer_event_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_notifications_org_user_idempotency_unique" UNIQUE("organization_id","recipient_user_id","idempotency_key"),
	CONSTRAINT "user_notifications_type_check" CHECK ("user_notifications"."notification_type" in ('closer_event_sla_overdue', 'closer_event_sla_escalated'))
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_event_tenant_fk" FOREIGN KEY ("closer_event_id","organization_id") REFERENCES "public"."closer_events"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_notifications_org_user_read_time_idx" ON "user_notifications" USING btree ("organization_id","recipient_user_id","read_at","created_at");