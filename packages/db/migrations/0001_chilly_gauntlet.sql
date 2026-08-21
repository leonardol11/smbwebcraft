CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_sites" ADD COLUMN "html" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "dunning_stage" integer DEFAULT 0 NOT NULL;