CREATE TABLE "message_hidden_for_users" (
	"organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_hidden_for_users_pk" PRIMARY KEY("organization_id","message_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "message_hidden_for_users" ADD CONSTRAINT "message_hidden_for_users_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_hidden_for_users" ADD CONSTRAINT "message_hidden_for_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_hidden_for_users" ADD CONSTRAINT "message_hidden_for_users_message_tenant_fk" FOREIGN KEY ("message_id","organization_id") REFERENCES "public"."messages"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_hidden_for_users_org_user_idx" ON "message_hidden_for_users" USING btree ("organization_id","user_id","message_id");