ALTER TABLE "user_notifications" DROP CONSTRAINT "user_notifications_type_check";--> statement-breakpoint
ALTER TABLE "user_notifications" ALTER COLUMN "closer_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_target_check" CHECK (("user_notifications"."closer_event_id" is null) <> ("user_notifications"."conversation_id" is null));--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_type_check" CHECK ("user_notifications"."notification_type" in ('closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message'));