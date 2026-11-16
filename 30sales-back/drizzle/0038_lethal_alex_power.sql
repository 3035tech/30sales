CREATE TABLE "pipelines" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipelines_organization_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "pipeline_stages" DROP CONSTRAINT "pipeline_stages_system_key_check";--> statement-breakpoint
DROP INDEX "pipeline_stages_org_active_name_unique";--> statement-breakpoint
DROP INDEX "pipeline_stages_org_active_position_idx";--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD COLUMN "from_pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD COLUMN "to_pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "pipeline_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "stage" "opportunity_stage";--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_org_active_name_unique" ON "pipelines" USING btree ("organization_id",lower("name")) WHERE "pipelines"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "pipelines_org_default_unique" ON "pipelines" USING btree ("organization_id") WHERE "pipelines"."is_default" = true;--> statement-breakpoint
CREATE INDEX "pipelines_org_active_idx" ON "pipelines" USING btree ("organization_id","is_active","name");--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_tenant_fk" FOREIGN KEY ("organization_id","pipeline_id") REFERENCES "public"."pipelines"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_tenant_fk" FOREIGN KEY ("organization_id","pipeline_id") REFERENCES "public"."pipelines"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_pipeline_active_name_unique" ON "pipeline_stages" USING btree ("organization_id","pipeline_id",lower("name")) WHERE "pipeline_stages"."is_system" = false and "pipeline_stages"."is_active" = true;--> statement-breakpoint
CREATE INDEX "pipeline_stages_org_pipeline_active_position_idx" ON "pipeline_stages" USING btree ("organization_id","pipeline_id","is_active","position");--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_system_key_check" CHECK (not "pipeline_stages"."is_system" or "pipeline_stages"."stage" in ('qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost'));