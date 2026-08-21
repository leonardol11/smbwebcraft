CREATE TABLE "agent_actions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent" text NOT NULL,
	"action" text NOT NULL,
	"intent" text,
	"detail" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"lead_id" text,
	"thread_id" text,
	"market_id" text,
	"input" jsonb,
	"output" jsonb,
	"error_stack" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micro_usd" integer,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_zips" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" text NOT NULL,
	"zip" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" text NOT NULL,
	"name" text NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"daily_cap" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_sites" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"deal_id" text,
	"slug" text NOT NULL,
	"template" text DEFAULT 'services' NOT NULL,
	"config" jsonb,
	"is_preview" boolean DEFAULT false NOT NULL,
	"preview_token" text,
	"preview_expires_at" timestamp with time zone,
	"preview_url" text,
	"live_url" text,
	"deploy_status" text DEFAULT 'none' NOT NULL,
	"deploy_error" text,
	"last_deployed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_checkout_session_id" text,
	"setup_cents" integer DEFAULT 10000 NOT NULL,
	"mrr_cents" integer DEFAULT 2500 NOT NULL,
	"paid_at" timestamp with time zone,
	"failed_since" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"transcript_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"email" text,
	"provider_message_id" text,
	"outreach_message_id" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_email" text,
	"to_email" text,
	"subject" text,
	"message_id" text,
	"in_reply_to" text,
	"references_header" text,
	"body_text" text,
	"body_html" text,
	"raw" jsonb,
	"match_status" text DEFAULT 'pending' NOT NULL,
	"matched_thread_id" text,
	"matched_lead_id" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"inngest_run_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" text NOT NULL,
	"campaign_id" text,
	"zip" text NOT NULL,
	"business_name" text NOT NULL,
	"owner_first_name" text,
	"phone" text,
	"email" text,
	"email_confidence" integer,
	"address" text,
	"city" text,
	"state" text,
	"places_id" text,
	"website_url" text,
	"category" text,
	"status" text DEFAULT 'discovered' NOT NULL,
	"qualification_reason" text,
	"places_data" jsonb,
	"last_touch_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text,
	"lead_id" text NOT NULL,
	"direction" text NOT NULL,
	"source" text DEFAULT 'system' NOT NULL,
	"sequence_step" integer,
	"provider_message_id" text,
	"in_reply_to" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"agent_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"lead_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" text,
	"subject" text,
	"status" text DEFAULT 'active' NOT NULL,
	"agent_paused" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_zips" ADD CONSTRAINT "campaign_zips_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sites" ADD CONSTRAINT "client_sites_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_actions_created_idx" ON "agent_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_actions_lead_idx" ON "agent_actions" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_actions_status_idx" ON "agent_actions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_zips_unique_idx" ON "campaign_zips" USING btree ("campaign_id","zip");--> statement-breakpoint
CREATE INDEX "campaigns_market_idx" ON "campaigns" USING btree ("market_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_sites_slug_idx" ON "client_sites" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "client_sites_lead_idx" ON "client_sites" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_lead_idx" ON "deals" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "email_events_type_created_idx" ON "email_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "inbound_match_status_idx" ON "inbound_emails" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "job_runs_name_idx" ON "job_runs" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_places_id_idx" ON "leads" USING btree ("places_id");--> statement-breakpoint
CREATE INDEX "leads_market_zip_idx" ON "leads" USING btree ("market_id","zip");--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "markets_slug_idx" ON "markets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "messages_lead_created_idx" ON "outreach_messages" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "outreach_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "messages_provider_id_idx" ON "outreach_messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_lead_step_idx" ON "outreach_messages" USING btree ("lead_id","sequence_step") WHERE sequence_step IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_email_idx" ON "suppressions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "threads_lead_idx" ON "threads" USING btree ("lead_id");