CREATE TYPE "public"."conversation_status" AS ENUM('open', 'pending', 'resolved', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."message_actor_type" AS ENUM('contact', 'user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."message_delivery_state" AS ENUM('received', 'requested', 'accepted', 'delivered', 'read', 'failed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_conversation_id" text NOT NULL,
	"account_id" uuid,
	"person_id" uuid,
	"opportunity_id" uuid,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"owner_user_id" uuid,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "conversations_provider_external_unique" UNIQUE("organization_id","provider","external_conversation_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_message_id" text,
	"direction" "message_direction" NOT NULL,
	"actor_type" "message_actor_type" NOT NULL,
	"body_text" text,
	"delivery_state" "message_delivery_state" DEFAULT 'unknown' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "messages_provider_external_unique" UNIQUE("organization_id","external_message_id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_tenant_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."accounts"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_person_tenant_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_opportunity_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_org_status_last_message_idx" ON "conversations" USING btree ("organization_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_org_owner_last_message_idx" ON "conversations" USING btree ("organization_id","owner_user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "messages_org_conversation_occurred_idx" ON "messages" USING btree ("organization_id","conversation_id","occurred_at");