ALTER TABLE "messages" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "credentials_ciphertext" text;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "credentials_iv" text;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "credentials_auth_tag" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_idempotency_unique" UNIQUE("organization_id","conversation_id","idempotency_key");