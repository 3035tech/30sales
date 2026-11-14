ALTER TABLE "tasks" ADD COLUMN "completion_result" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completion_note" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completion_result_check" CHECK ("tasks"."completion_result" is null or "tasks"."completion_result" in ('completed', 'contacted', 'no_response', 'follow_up'));