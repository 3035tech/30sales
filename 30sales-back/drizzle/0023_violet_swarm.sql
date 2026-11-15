ALTER TABLE "agent_settings" DROP CONSTRAINT "agent_settings_model_check";--> statement-breakpoint
ALTER TABLE "agent_settings" ALTER COLUMN "model" SET DEFAULT 'claude-haiku-5-5';--> statement-breakpoint
UPDATE "agent_settings" SET "model" = 'claude-haiku-5-5' WHERE "model" = 'claude-haiku-4-5-20251001';--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_model_check" CHECK ("agent_settings"."model" in ('claude-haiku-5-5'));
