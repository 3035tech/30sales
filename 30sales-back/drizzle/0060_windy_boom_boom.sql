CREATE TYPE "public"."business_line_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "business_line_members" (
	"organization_id" uuid NOT NULL,
	"business_line_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_line_members_pk" PRIMARY KEY("organization_id","business_line_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "business_lines" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"status" "business_line_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_lines_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "business_lines_name_length_check" CHECK (length(trim("business_lines"."name")) between 2 and 100),
	CONSTRAINT "business_lines_slug_check" CHECK ("business_lines"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("business_lines"."slug") <= 80),
	CONSTRAINT "business_lines_description_length_check" CHECK ("business_lines"."description" is null or length("business_lines"."description") <= 500)
);
--> statement-breakpoint
ALTER TABLE "business_line_members" ADD CONSTRAINT "business_line_members_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_line_members" ADD CONSTRAINT "business_line_members_line_tenant_fk" FOREIGN KEY ("organization_id","business_line_id") REFERENCES "public"."business_lines"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_line_members" ADD CONSTRAINT "business_line_members_member_tenant_fk" FOREIGN KEY ("organization_id","member_id") REFERENCES "auth"."member"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_lines" ADD CONSTRAINT "business_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_lines" ADD CONSTRAINT "business_lines_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_line_members_org_member_idx" ON "business_line_members" USING btree ("organization_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_lines_org_slug_unique" ON "business_lines" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "business_lines_org_status_name_idx" ON "business_lines" USING btree ("organization_id","status","name");