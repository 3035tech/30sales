CREATE TABLE "opportunity_conversation_contexts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"confirmed_facts" text[] NOT NULL,
	"unknowns" text[] NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "opportunity_conversation_contexts_org_conversation_unique" UNIQUE("organization_id","conversation_id")
);
--> statement-breakpoint
ALTER TABLE "opportunity_conversation_contexts" ADD CONSTRAINT "opportunity_conversation_contexts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_conversation_contexts" ADD CONSTRAINT "opportunity_conversation_contexts_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_conversation_contexts" ADD CONSTRAINT "opportunity_conversation_contexts_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_conversation_contexts_org_opportunity_captured_idx" ON "opportunity_conversation_contexts" USING btree ("organization_id","opportunity_id","captured_at");