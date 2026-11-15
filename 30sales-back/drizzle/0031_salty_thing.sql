ALTER TABLE "user_notifications" DROP CONSTRAINT "user_notifications_target_check";--> statement-breakpoint
ALTER TABLE "user_notifications" DROP CONSTRAINT "user_notifications_type_check";--> statement-breakpoint
ALTER TABLE "user_notifications" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_id_organization_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_target_check" CHECK (num_nonnulls("user_notifications"."closer_event_id", "user_notifications"."conversation_id", "user_notifications"."task_id") = 1);--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_type_check" CHECK ("user_notifications"."notification_type" in ('closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message', 'task_overdue'));