CREATE TABLE "account_people" (
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_people_pk" PRIMARY KEY("organization_id","account_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_account_tenant_fk" FOREIGN KEY ("account_id","organization_id") REFERENCES "public"."accounts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_people" ADD CONSTRAINT "account_people_person_tenant_fk" FOREIGN KEY ("person_id","organization_id") REFERENCES "public"."people"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_people_org_person_idx" ON "account_people" USING btree ("organization_id","person_id");