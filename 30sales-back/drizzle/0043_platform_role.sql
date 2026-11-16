CREATE TYPE "auth"."platform_role" AS ENUM('user', 'super_admin');--> statement-breakpoint
ALTER TABLE "auth"."user" ADD COLUMN "platform_role" "auth"."platform_role" DEFAULT 'user' NOT NULL;