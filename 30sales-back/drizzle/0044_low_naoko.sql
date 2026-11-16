CREATE TABLE "account_segments" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_segments_id_organization_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "account_segments_name_length_check" CHECK (length(trim("account_segments"."name")) between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "segment_id" uuid;--> statement-breakpoint
ALTER TABLE "account_segments" ADD CONSTRAINT "account_segments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_segments" ADD CONSTRAINT "account_segments_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_segments_org_name_unique" ON "account_segments" USING btree ("organization_id",lower(trim("name")));--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_segment_tenant_fk" FOREIGN KEY ("segment_id","organization_id") REFERENCES "public"."account_segments"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_org_segment_idx" ON "accounts" USING btree ("organization_id","segment_id");