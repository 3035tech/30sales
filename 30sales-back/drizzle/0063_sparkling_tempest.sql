CREATE TABLE "platform_evolution_configuration" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"credentials_ciphertext" text NOT NULL,
	"credentials_iv" text NOT NULL,
	"credentials_auth_tag" text NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_evolution_configuration_id_check" CHECK ("platform_evolution_configuration"."id" = 'default')
);
--> statement-breakpoint
ALTER TABLE "platform_evolution_configuration" ADD CONSTRAINT "platform_evolution_configuration_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;