CREATE TABLE "pipeline_stages" (
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"position" integer NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_stages_org_key_pk" PRIMARY KEY("organization_id","key"),
	CONSTRAINT "pipeline_stages_name_check" CHECK ("pipeline_stages"."is_system" or ("pipeline_stages"."name" is not null and length(trim("pipeline_stages"."name")) between 2 and 64)),
	CONSTRAINT "pipeline_stages_system_key_check" CHECK (not "pipeline_stages"."is_system" or "pipeline_stages"."key" in ('qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost'))
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "pipeline_stage_key" text;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD COLUMN "from_pipeline_stage_key" text;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD COLUMN "to_pipeline_stage_key" text;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_stages_org_active_name_unique" ON "pipeline_stages" USING btree ("organization_id",lower("name")) WHERE "pipeline_stages"."is_system" = false and "pipeline_stages"."is_active" = true;--> statement-breakpoint
CREATE INDEX "pipeline_stages_org_active_position_idx" ON "pipeline_stages" USING btree ("organization_id","is_active","position");--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_pipeline_stage_tenant_fk" FOREIGN KEY ("organization_id","pipeline_stage_key") REFERENCES "public"."pipeline_stages"("organization_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_from_pipeline_stage_tenant_fk" FOREIGN KEY ("organization_id","from_pipeline_stage_key") REFERENCES "public"."pipeline_stages"("organization_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_to_pipeline_stage_tenant_fk" FOREIGN KEY ("organization_id","to_pipeline_stage_key") REFERENCES "public"."pipeline_stages"("organization_id","key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_custom_stage_check" CHECK (("opportunities"."stage" = 'custom' and "opportunities"."pipeline_stage_key" is not null) or ("opportunities"."stage" <> 'custom' and "opportunities"."pipeline_stage_key" is null));--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_from_custom_stage_check" CHECK (("opportunity_stage_history"."from_stage" is null and "opportunity_stage_history"."from_pipeline_stage_key" is null) or ("opportunity_stage_history"."from_stage" = 'custom' and "opportunity_stage_history"."from_pipeline_stage_key" is not null) or ("opportunity_stage_history"."from_stage" is not null and "opportunity_stage_history"."from_stage" <> 'custom' and "opportunity_stage_history"."from_pipeline_stage_key" is null));--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_to_custom_stage_check" CHECK (("opportunity_stage_history"."to_stage" = 'custom' and "opportunity_stage_history"."to_pipeline_stage_key" is not null) or ("opportunity_stage_history"."to_stage" <> 'custom' and "opportunity_stage_history"."to_pipeline_stage_key" is null));