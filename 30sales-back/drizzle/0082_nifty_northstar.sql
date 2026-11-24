CREATE TABLE "conversation_group_participants" (
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_participant_id" text NOT NULL,
	"phone" text,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_present" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_group_participants_org_conversation_provider_participant_unique" UNIQUE("organization_id","conversation_id","provider","external_participant_id"),
	CONSTRAINT "conversation_group_participants_external_id_length_check" CHECK (length("conversation_group_participants"."external_participant_id") between 1 and 250)
);
--> statement-breakpoint
ALTER TABLE "conversation_group_participants" ADD CONSTRAINT "conversation_group_participants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_group_participants" ADD CONSTRAINT "conversation_group_participants_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_group_participants_org_conversation_present_idx" ON "conversation_group_participants" USING btree ("organization_id","conversation_id","is_present","display_name");