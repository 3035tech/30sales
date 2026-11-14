CREATE TABLE "conversation_tag_links" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_tag_links_org_conversation_tag_unique" UNIQUE("organization_id","conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_tags_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "conversation_tags_org_normalized_name_unique" UNIQUE("organization_id","normalized_name")
);
--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_conversation_tenant_fk" FOREIGN KEY ("conversation_id","organization_id") REFERENCES "public"."conversations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tag_links" ADD CONSTRAINT "conversation_tag_links_tag_tenant_fk" FOREIGN KEY ("tag_id","organization_id") REFERENCES "public"."conversation_tags"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_tag_links_org_tag_conversation_idx" ON "conversation_tag_links" USING btree ("organization_id","tag_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_tags_org_name_idx" ON "conversation_tags" USING btree ("organization_id","name");