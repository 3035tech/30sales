CREATE TYPE "public"."assistant_run_operation" AS ENUM('reply_generation', 'audio_transcription');--> statement-breakpoint
ALTER TYPE "public"."assistant_run_provider" ADD VALUE 'openai';--> statement-breakpoint
ALTER TABLE "assistant_runs" DROP CONSTRAINT "assistant_runs_org_event_attempt_unique";--> statement-breakpoint
ALTER TABLE "assistant_runs" DROP CONSTRAINT "assistant_runs_prompt_hash_check";--> statement-breakpoint
ALTER TABLE "assistant_runs" ALTER COLUMN "prompt_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "operation" "assistant_run_operation" DEFAULT 'reply_generation' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "audio_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "audio_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "pricing_version" text DEFAULT '2026-11-16' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "estimated_cost_usd" numeric(18, 10);--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_org_event_attempt_operation_unique" UNIQUE("organization_id","queue_event_id","attempt","operation");--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_audio_metrics_check" CHECK (("assistant_runs"."audio_duration_ms" is null or "assistant_runs"."audio_duration_ms" > 0) and ("assistant_runs"."audio_size_bytes" is null or "assistant_runs"."audio_size_bytes" > 0));--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_estimated_cost_check" CHECK ("assistant_runs"."estimated_cost_usd" is null or "assistant_runs"."estimated_cost_usd" >= 0);--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_prompt_hash_check" CHECK ("assistant_runs"."prompt_hash" is null or length("assistant_runs"."prompt_hash") = 64);