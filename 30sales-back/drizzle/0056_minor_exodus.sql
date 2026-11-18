CREATE TABLE "channel_business_hours" (
	"organization_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	CONSTRAINT "channel_business_hours_pk" PRIMARY KEY("organization_id","channel_id","day_of_week"),
	CONSTRAINT "channel_business_hours_day_check" CHECK ("channel_business_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "channel_business_hours_time_check" CHECK ("channel_business_hours"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "channel_business_hours"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "channel_business_hours"."start_time" <> "channel_business_hours"."end_time")
);
--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "operation_mode" text DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD COLUMN "assistant_schedule_mode" text DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_business_hours" ADD CONSTRAINT "channel_business_hours_channel_tenant_fk" FOREIGN KEY ("channel_id","organization_id") REFERENCES "public"."messaging_channels"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_operation_mode_check" CHECK ("messaging_channels"."operation_mode" in ('inbound', 'outbound', 'hybrid'));--> statement-breakpoint
ALTER TABLE "messaging_channels" ADD CONSTRAINT "messaging_channels_assistant_schedule_mode_check" CHECK ("messaging_channels"."assistant_schedule_mode" in ('always', 'business_hours', 'after_hours', 'disabled'));