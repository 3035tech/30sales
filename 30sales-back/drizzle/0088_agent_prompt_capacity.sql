ALTER TABLE "agent_settings" DROP CONSTRAINT "agent_settings_prompt_length_check";--> statement-breakpoint
ALTER TABLE "assistant_profiles" DROP CONSTRAINT "assistant_profiles_prompt_length_check";--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_prompt_length_check" CHECK (length("agent_settings"."system_prompt") <= 100000);--> statement-breakpoint
ALTER TABLE "assistant_profiles" ADD CONSTRAINT "assistant_profiles_prompt_length_check" CHECK (length("assistant_profiles"."system_prompt") <= 100000);