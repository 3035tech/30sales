CREATE TABLE "evolution_group_metadata" (
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"group_jid" text NOT NULL,
	"display_name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evolution_group_metadata_org_channel_jid_pk" PRIMARY KEY("organization_id","channel_id","group_jid"),
	CONSTRAINT "evolution_group_metadata_jid_length_check" CHECK (length("evolution_group_metadata"."group_jid") between 1 and 250),
	CONSTRAINT "evolution_group_metadata_display_name_length_check" CHECK (length(trim("evolution_group_metadata"."display_name")) between 1 and 160)
);
--> statement-breakpoint
ALTER TABLE "evolution_group_metadata" ADD CONSTRAINT "evolution_group_metadata_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_group_metadata" ADD CONSTRAINT "evolution_group_metadata_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE cascade ON UPDATE no action;