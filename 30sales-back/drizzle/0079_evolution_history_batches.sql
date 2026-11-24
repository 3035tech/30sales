CREATE TABLE "evolution_history_batches" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_event_id" text NOT NULL,
	"payload_ciphertext" text NOT NULL,
	"payload_iv" text NOT NULL,
	"payload_auth_tag" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolution_history_batches_org_event_unique" UNIQUE("organization_id","external_event_id"),
	CONSTRAINT "evolution_history_batches_status_check" CHECK ("evolution_history_batches"."status" in ('queued', 'processing', 'completed', 'failed')),
	CONSTRAINT "evolution_history_batches_attempts_check" CHECK ("evolution_history_batches"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "evolution_history_batches" ADD CONSTRAINT "evolution_history_batches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_history_batches" ADD CONSTRAINT "evolution_history_batches_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evolution_history_batches_status_available_idx" ON "evolution_history_batches" USING btree ("status","available_at");