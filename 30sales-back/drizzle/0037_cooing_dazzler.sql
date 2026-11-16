ALTER TABLE "agent_settings" DROP CONSTRAINT "agent_settings_model_check";--> statement-breakpoint
ALTER TABLE "agent_settings" ADD COLUMN "transcribe_audio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "transcript_text" text;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_model_check" CHECK ("agent_settings"."model" in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'));