CREATE TABLE "channel_assistant_schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"assistant_enabled" boolean NOT NULL,
	"start_time" text,
	"end_time" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_assistant_schedule_exceptions_org_channel_date_unique" UNIQUE("organization_id","channel_id","local_date"),
	CONSTRAINT "channel_assistant_schedule_exceptions_window_check" CHECK (("channel_assistant_schedule_exceptions"."assistant_enabled" and (("channel_assistant_schedule_exceptions"."start_time" is null and "channel_assistant_schedule_exceptions"."end_time" is null) or ("channel_assistant_schedule_exceptions"."start_time" is not null and "channel_assistant_schedule_exceptions"."end_time" is not null and "channel_assistant_schedule_exceptions"."start_time" < "channel_assistant_schedule_exceptions"."end_time"))) or (not "channel_assistant_schedule_exceptions"."assistant_enabled" and "channel_assistant_schedule_exceptions"."start_time" is null and "channel_assistant_schedule_exceptions"."end_time" is null)),
	CONSTRAINT "channel_assistant_schedule_exceptions_time_format_check" CHECK (("channel_assistant_schedule_exceptions"."start_time" is null or "channel_assistant_schedule_exceptions"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and ("channel_assistant_schedule_exceptions"."end_time" is null or "channel_assistant_schedule_exceptions"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
ALTER TABLE "channel_assistant_schedule_exceptions" ADD CONSTRAINT "channel_assistant_schedule_exceptions_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE cascade ON UPDATE no action;