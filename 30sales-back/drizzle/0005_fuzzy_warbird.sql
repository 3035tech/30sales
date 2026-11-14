CREATE TABLE "opportunity_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"from_stage" "opportunity_stage",
	"to_stage" "opportunity_stage" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "loss_reason" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "next_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_tenant_fk" FOREIGN KEY ("opportunity_id","organization_id") REFERENCES "public"."opportunities"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_stage_history_org_opportunity_idx" ON "opportunity_stage_history" USING btree ("organization_id","opportunity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "opportunities_org_owner_stage_idx" ON "opportunities" USING btree ("organization_id","owner_user_id","stage");--> statement-breakpoint
CREATE INDEX "opportunities_org_next_action_idx" ON "opportunities" USING btree ("organization_id","next_action_at");