import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Markets & campaigns (city-first organization)
// ---------------------------------------------------------------------------

export type CampaignStatus = "draft" | "running" | "paused";

export const markets = pgTable(
  "markets",
  {
    id: id(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("markets_slug_idx").on(t.slug)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    status: text("status").$type<CampaignStatus>().notNull().default("draft"),
    dailyCap: integer("daily_cap").notNull().default(25),
    createdAt: createdAt(),
  },
  (t) => [index("campaigns_market_idx").on(t.marketId)],
);

export const campaignZips = pgTable(
  "campaign_zips",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    zip: text("zip").notNull(),
  },
  (t) => [uniqueIndex("campaign_zips_unique_idx").on(t.campaignId, t.zip)],
);

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export type LeadStatus =
  | "discovered"
  | "qualified"
  | "skipped"
  | "ready"
  | "sequenced"
  | "replied"
  | "interested"
  | "customer"
  | "not_interested"
  | "suppressed";

export type PlacesData = {
  rating?: number;
  reviewCount?: number;
  hours?: Record<string, string>;
  photoUrls?: string[];
  types?: string[];
};

export const leads = pgTable(
  "leads",
  {
    id: id(),
    marketId: text("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    zip: text("zip").notNull(),
    businessName: text("business_name").notNull(),
    ownerFirstName: text("owner_first_name"),
    phone: text("phone"),
    email: text("email"),
    emailConfidence: integer("email_confidence"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    placesId: text("places_id"),
    websiteUrl: text("website_url"),
    category: text("category"),
    status: text("status").$type<LeadStatus>().notNull().default("discovered"),
    qualificationReason: text("qualification_reason"),
    placesData: jsonb("places_data").$type<PlacesData>(),
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("leads_places_id_idx").on(t.placesId),
    index("leads_market_zip_idx").on(t.marketId, t.zip),
    index("leads_status_idx").on(t.status),
    index("leads_email_idx").on(t.email),
  ],
);

// ---------------------------------------------------------------------------
// Threads & messages
// ---------------------------------------------------------------------------

export type ThreadStatus = "active" | "closed" | "unmatched";

export const threads = pgTable(
  "threads",
  {
    id: id(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    subject: text("subject"),
    status: text("status").$type<ThreadStatus>().notNull().default("active"),
    agentPaused: boolean("agent_paused").notNull().default(false),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("threads_lead_idx").on(t.leadId)],
);

export type MessageDirection = "outbound" | "inbound";
export type MessageSource = "sequence" | "reply_agent" | "manual" | "system";
export type MessageStatus =
  | "queued"
  | "draft"
  | "sent"
  | "delivered"
  | "opened"
  | "bounced"
  | "complained"
  | "received";

export const outreachMessages = pgTable(
  "outreach_messages",
  {
    id: id(),
    threadId: text("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    direction: text("direction").$type<MessageDirection>().notNull(),
    source: text("source").$type<MessageSource>().notNull().default("system"),
    sequenceStep: integer("sequence_step"),
    providerMessageId: text("provider_message_id"),
    inReplyTo: text("in_reply_to"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    status: text("status").$type<MessageStatus>().notNull().default("queued"),
    agentActionId: text("agent_action_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_lead_created_idx").on(t.leadId, t.createdAt),
    index("messages_thread_idx").on(t.threadId),
    index("messages_provider_id_idx").on(t.providerMessageId),
    uniqueIndex("messages_lead_step_idx")
      .on(t.leadId, t.sequenceStep)
      .where(sql`sequence_step IS NOT NULL`),
  ],
);

export type InboundMatchStatus = "pending" | "matched" | "unmatched";

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: id(),
    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    subject: text("subject"),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    raw: jsonb("raw"),
    matchStatus: text("match_status").$type<InboundMatchStatus>().notNull().default("pending"),
    matchedThreadId: text("matched_thread_id"),
    matchedLeadId: text("matched_lead_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("inbound_match_status_idx").on(t.matchStatus)],
);

export type EmailEventType = "delivered" | "bounced" | "complained" | "opened";

export const emailEvents = pgTable(
  "email_events",
  {
    id: id(),
    type: text("type").$type<EmailEventType>().notNull(),
    email: text("email"),
    providerMessageId: text("provider_message_id"),
    outreachMessageId: text("outreach_message_id"),
    payload: jsonb("payload"),
    createdAt: createdAt(),
  },
  (t) => [index("email_events_type_created_idx").on(t.type, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Deals & client sites
// ---------------------------------------------------------------------------

export type DealStatus =
  | "pending"
  | "checkout_sent"
  | "paid"
  | "past_due"
  | "suspended"
  | "canceled";

export const deals = pgTable(
  "deals",
  {
    id: id(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    status: text("status").$type<DealStatus>().notNull().default("pending"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    setupCents: integer("setup_cents").notNull().default(10000),
    mrrCents: integer("mrr_cents").notNull().default(2500),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    failedSince: timestamp("failed_since", { withTimezone: true }),
    /** Highest dunning day (1/3/7) already emailed for the current past_due episode. */
    dunningStage: integer("dunning_stage").notNull().default(0),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    transcriptSnapshot: jsonb("transcript_snapshot"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("deals_lead_idx").on(t.leadId)],
);

export type DeployStatus =
  | "none"
  | "building"
  | "deploying"
  | "preview"
  | "live"
  | "failed"
  | "suspended";

export const clientSites = pgTable(
  "client_sites",
  {
    id: id(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    template: text("template").$type<"services" | "food_salon">().notNull().default("services"),
    config: jsonb("config"),
    /** Rendered HTML (cached so the public /preview route can serve instantly). */
    html: text("html"),
    isPreview: boolean("is_preview").notNull().default(false),
    previewToken: text("preview_token"),
    previewExpiresAt: timestamp("preview_expires_at", { withTimezone: true }),
    previewUrl: text("preview_url"),
    liveUrl: text("live_url"),
    deployStatus: text("deploy_status").$type<DeployStatus>().notNull().default("none"),
    deployError: text("deploy_error"),
    lastDeployedAt: timestamp("last_deployed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("client_sites_slug_idx").on(t.slug),
    index("client_sites_lead_idx").on(t.leadId),
  ],
);

// ---------------------------------------------------------------------------
// Observability: agent actions + job runs
// ---------------------------------------------------------------------------

export type AgentName =
  | "discovery"
  | "qualify"
  | "enrich"
  | "outreach"
  | "reply"
  | "sitegen"
  | "deploy"
  | "billing"
  | "system";

export type AgentActionStatus = "ok" | "error" | "escalated" | "draft";

export const agentActions = pgTable(
  "agent_actions",
  {
    id: id(),
    agent: text("agent").$type<AgentName>().notNull(),
    action: text("action").notNull(),
    intent: text("intent"),
    detail: text("detail"),
    status: text("status").$type<AgentActionStatus>().notNull().default("ok"),
    leadId: text("lead_id"),
    threadId: text("thread_id"),
    marketId: text("market_id"),
    input: jsonb("input"),
    output: jsonb("output"),
    errorStack: text("error_stack"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicroUsd: integer("cost_micro_usd"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_actions_created_idx").on(t.createdAt),
    index("agent_actions_lead_idx").on(t.leadId, t.createdAt),
    index("agent_actions_status_idx").on(t.status),
  ],
);

export type JobStatus = "running" | "completed" | "failed";

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    name: text("name").notNull(),
    inngestRunId: text("inngest_run_id"),
    status: text("status").$type<JobStatus>().notNull().default("running"),
    input: jsonb("input"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("job_runs_name_idx").on(t.name, t.createdAt),
    index("job_runs_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Suppression + settings
// ---------------------------------------------------------------------------

export type SuppressionReason =
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "not_interested"
  | "manual";

export const suppressions = pgTable(
  "suppressions",
  {
    id: id(),
    email: text("email").notNull(),
    reason: text("reason").$type<SuppressionReason>().notNull(),
    leadId: text("lead_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppressions_email_idx").on(t.email)],
);

/** Processed Stripe webhook event ids (idempotency on duplicate delivery). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Convenience export of every table for migrations/tests.
export const allTables = {
  markets,
  campaigns,
  campaignZips,
  leads,
  threads,
  outreachMessages,
  inboundEmails,
  emailEvents,
  deals,
  clientSites,
  agentActions,
  jobRuns,
  suppressions,
  stripeEvents,
  settings,
};
