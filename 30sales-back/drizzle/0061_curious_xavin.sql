ALTER TABLE "business_lines" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pipelines" ADD COLUMN "business_line_id" uuid;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_business_line_tenant_fk" FOREIGN KEY ("organization_id","business_line_id") REFERENCES "public"."business_lines"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_lines_org_default_unique" ON "business_lines" USING btree ("organization_id") WHERE "business_lines"."is_default" = true;--> statement-breakpoint
CREATE INDEX "pipelines_org_line_active_idx" ON "pipelines" USING btree ("organization_id","business_line_id","is_active","name");