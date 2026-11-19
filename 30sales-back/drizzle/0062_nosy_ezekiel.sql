DROP INDEX "pipelines_org_active_name_unique";--> statement-breakpoint
DROP INDEX "pipelines_org_default_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_org_line_active_name_unique" ON "pipelines" USING btree ("organization_id","business_line_id",lower("name")) WHERE "pipelines"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_org_line_default_unique" ON "pipelines" USING btree ("organization_id","business_line_id") WHERE "pipelines"."is_default" = true;