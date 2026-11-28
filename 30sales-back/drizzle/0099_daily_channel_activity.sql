ALTER TABLE "messaging_channels" ADD COLUMN "activity_owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "daily_new_contact_goal" integer;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "daily_continuation_goal" integer;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_daily_new_contact_goal_check" CHECK ("messaging_channels"."daily_new_contact_goal" is null or "messaging_channels"."daily_new_contact_goal" between 1 and 10000);--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_daily_continuation_goal_check" CHECK ("messaging_channels"."daily_continuation_goal" is null or "messaging_channels"."daily_continuation_goal" between 1 and 10000);