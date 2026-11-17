CREATE TYPE "public"."assistant_delivery_outcome" AS ENUM('pending', 'message_created', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "public"."assistant_intent" AS ENUM('qualification', 'information_request', 'explicit_human_request', 'meeting_request', 'proposal_request', 'not_interested', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."assistant_run_provider" AS ENUM('anthropic');--> statement-breakpoint
CREATE TYPE "public"."assistant_run_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."assistant_stop_reason" AS ENUM('end_turn', 'tool_use', 'max_tokens', 'refusal', 'stop_sequence', 'other');--> statement-breakpoint
CREATE TABLE "assistant_runs" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid NOT NULL,
	"outbound_message_id" uuid,
	"queue_event_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"provider" "assistant_run_provider" DEFAULT 'anthropic' NOT NULL,
	"model_key" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"status" "assistant_run_status" DEFAULT 'started' NOT NULL,
	"delivery_outcome" "assistant_delivery_outcome" DEFAULT 'pending' NOT NULL,
	"intent" "assistant_intent",
	"usage_input_tokens" integer,
	"usage_output_tokens" integer,
	"latency_ms" integer,
	"stop_reason" "assistant_stop_reason",
	"delivery_state" "message_delivery_state",
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "assistant_runs_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "assistant_runs_org_event_attempt_unique" UNIQUE("organization_id","queue_event_id","attempt"),
	CONSTRAINT "assistant_runs_attempt_check" CHECK ("assistant_runs"."attempt" > 0),
	CONSTRAINT "assistant_runs_usage_check" CHECK (("assistant_runs"."usage_input_tokens" is null or "assistant_runs"."usage_input_tokens" >= 0) and ("assistant_runs"."usage_output_tokens" is null or "assistant_runs"."usage_output_tokens" >= 0)),
	CONSTRAINT "assistant_runs_latency_check" CHECK ("assistant_runs"."latency_ms" is null or "assistant_runs"."latency_ms" >= 0),
	CONSTRAINT "assistant_runs_prompt_hash_check" CHECK (length("assistant_runs"."prompt_hash") = 64)
);
--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_inbound_message_tenant_fk" FOREIGN KEY ("inbound_message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_outbound_message_tenant_fk" FOREIGN KEY ("outbound_message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_id_organization_unique" UNIQUE("id","organization_id");--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_queue_event_tenant_fk" FOREIGN KEY ("queue_event_id","organization_id") REFERENCES "public"."outbox_events"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_runs_org_started_idx" ON "assistant_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "assistant_runs_org_conversation_idx" ON "assistant_runs" USING btree ("organization_id","conversation_id","started_at");
