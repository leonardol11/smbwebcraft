import { describe, expect, it, beforeEach, vi } from "vitest";
import { agentActions, createTestDb, eq, leads, markets, type Db } from "@outreach/db";
import type { EmailEnricher, EnrichResult } from "./enricher";
import {
  clearEnrichCacheForTests,
  createEmailEnricher,
  enrichLead,
  FakeEmailEnricher,
  HunterEmailEnricher,
  scrapeMailtoFromWebsite,
} from "./index";

class StubEnricher implements EmailEnricher {
  readonly lookupCostMicroUsd: number;
  readonly findEmail: ReturnType<typeof vi.fn<(domain: string) => Promise<EnrichResult | null>>>;

  constructor(
    result: EnrichResult | null = { email: "owner@shared.example.com", confidence: 88 },
    cost = 1234,
  ) {
    this.lookupCostMicroUsd = cost;
    this.findEmail = vi.fn(async () => result);
  }
}

function htmlFetch(html: string, status = 200): typeof fetch {
  return (async () => new Response(html, { status })) as typeof fetch;
}

describe("createEmailEnricher", () => {
  it("returns FakeEmailEnricher when PROVIDER_MODE is fake", () => {
    expect(createEmailEnricher()).toBeInstanceOf(FakeEmailEnricher);
  });

  it("returns an injected enricher as-is", () => {
    const stub = new StubEnricher();
    expect(createEmailEnricher(stub)).toBe(stub);
  });
});

describe("enrichLead", () => {
  let db: Db;

  beforeEach(async () => {
    clearEnrichCacheForTests();
    db = await createTestDb();
  });

  async function insertLead(values: {
    slug: string;
    businessName: string;
    websiteUrl?: string | null;
    email?: string | null;
  }) {
    const [m] = await db
      .insert(markets)
      .values({ city: "Austin", state: "TX", slug: values.slug })
      .returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: m!.id,
        zip: "78701",
        businessName: values.businessName,
        websiteUrl: values.websiteUrl ?? null,
        email: values.email ?? null,
        status: "qualified",
      })
      .returning();
    return lead!;
  }

  it("enriches a missing-email lead and persists email + confidence", async () => {
    const lead = await insertLead({
      slug: "enrich-a",
      businessName: "Joe Plumbing",
      websiteUrl: "https://joesplumbing.example.com",
    });

    const result = await enrichLead(db, lead.id, { enricher: new FakeEmailEnricher() });
    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("expected enrichment");
    expect(result.email).toContain("@");
    expect(result.confidence).toBeGreaterThan(0);

    const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(row!.email).toBe(result.email);
    expect(row!.emailConfidence).toBe(result.confidence);
  });

  it("skips when email already present", async () => {
    const lead = await insertLead({
      slug: "enrich-b",
      businessName: "Has Email",
      email: "owner@biz.com",
    });

    const result = await enrichLead(db, lead.id);
    expect(result).toEqual({ leadId: lead.id, skipped: true, reason: "has_email" });

    const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(row!.email).toBe("owner@biz.com");
  });

  it("uses domain cache on a second lead with the same website", async () => {
    const stub = new StubEnricher({ email: "hello@shared.example.com", confidence: 77 });
    const [m] = await db.insert(markets).values({ city: "C", state: "TX", slug: "enrich-c" }).returning();
    const shared = {
      marketId: m!.id,
      zip: "78701",
      websiteUrl: "https://shared.example.com",
      status: "qualified" as const,
    };
    const [lead1] = await db
      .insert(leads)
      .values({ ...shared, businessName: "Same Domain 1" })
      .returning();
    const [lead2] = await db
      .insert(leads)
      .values({ ...shared, businessName: "Same Domain 2" })
      .returning();

    const first = await enrichLead(db, lead1!.id, { enricher: stub });
    const second = await enrichLead(db, lead2!.id, { enricher: stub });

    expect(stub.findEmail).toHaveBeenCalledTimes(1);
    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(false);
    if (first.skipped || second.skipped) throw new Error("expected enrichment");
    expect(second.email).toBe(first.email);
    expect(second.source).toBe("cache");

    const [row2] = await db.select().from(leads).where(eq(leads.id, lead2!.id));
    expect(row2!.email).toBe("hello@shared.example.com");
    expect(row2!.emailConfidence).toBe(77);
  });

  it("logs per-lead enrichment cost on agent_actions", async () => {
    const stub = new StubEnricher({ email: "ada@plumber.com", confidence: 91 }, 4321);
    const lead = await insertLead({
      slug: "enrich-cost",
      businessName: "Costed Plumbing",
      websiteUrl: "https://costed.example.com",
    });

    await enrichLead(db, lead.id, { enricher: stub });

    const actions = await db.select().from(agentActions).where(eq(agentActions.leadId, lead.id));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.agent).toBe("enrich");
    expect(actions[0]!.action).toBe("enrich_lead");
    expect(actions[0]!.costMicroUsd).toBe(4321);
    expect(actions[0]!.status).toBe("ok");
  });

  it("logs zero cost on a domain-cache hit", async () => {
    const stub = new StubEnricher({ email: "cache@shared.com", confidence: 70 }, 9999);
    const [m] = await db.insert(markets).values({ city: "D", state: "TX", slug: "enrich-cache-cost" }).returning();
    const shared = {
      marketId: m!.id,
      zip: "78701",
      websiteUrl: "https://cached-cost.example.com",
      status: "qualified" as const,
    };
    const [lead1] = await db.insert(leads).values({ ...shared, businessName: "One" }).returning();
    const [lead2] = await db.insert(leads).values({ ...shared, businessName: "Two" }).returning();

    await enrichLead(db, lead1!.id, { enricher: stub });
    await enrichLead(db, lead2!.id, { enricher: stub });

    const firstActions = await db.select().from(agentActions).where(eq(agentActions.leadId, lead1!.id));
    const secondActions = await db.select().from(agentActions).where(eq(agentActions.leadId, lead2!.id));
    expect(firstActions[0]!.costMicroUsd).toBe(9999);
    expect(secondActions[0]!.costMicroUsd).toBe(0);
  });

  it("falls back to mailto scrape when the enricher finds nothing", async () => {
    const stub = new StubEnricher(null, 100);
    const lead = await insertLead({
      slug: "enrich-mailto",
      businessName: "Mailto Shop",
      websiteUrl: "https://mailto-shop.com",
    });

    const result = await enrichLead(db, lead.id, {
      enricher: stub,
      fetchImpl: htmlFetch('<html><a href="mailto:hello@mailto-shop.com">email</a></html>'),
    });

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("expected mailto enrichment");
    expect(result.email).toBe("hello@mailto-shop.com");
    expect(result.confidence).toBe(40);
    expect(result.source).toBe("mailto");

    const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(row!.email).toBe("hello@mailto-shop.com");
    expect(row!.emailConfidence).toBe(40);

    const actions = await db.select().from(agentActions).where(eq(agentActions.leadId, lead.id));
    expect(actions[0]!.costMicroUsd).toBe(100);
  });

  it("returns not_found without throwing when no email is available", async () => {
    const stub = new StubEnricher(null, 50);
    const lead = await insertLead({
      slug: "enrich-miss",
      businessName: "No Email LLC",
      websiteUrl: "https://noemail-shop.com",
    });

    const result = await enrichLead(db, lead.id, {
      enricher: stub,
      fetchImpl: htmlFetch("<html><body>no contact</body></html>"),
    });

    expect(result).toEqual({ leadId: lead.id, skipped: true, reason: "not_found" });
    const [row] = await db.select().from(leads).where(eq(leads.id, lead.id));
    expect(row!.email).toBeNull();

    const actions = await db.select().from(agentActions).where(eq(agentActions.leadId, lead.id));
    expect(actions[0]!.costMicroUsd).toBe(50);
    expect(actions[0]!.output).toMatchObject({ found: false });
  });
});

describe("scrapeMailtoFromWebsite", () => {
  it("extracts the first non-placeholder mailto address", async () => {
    const result = await scrapeMailtoFromWebsite(
      "https://shop.com",
      htmlFetch('<a href="mailto:info@shop.com?subject=Hi">write us</a>'),
    );
    expect(result).toEqual({ email: "info@shop.com", confidence: 40 });
  });

  it("returns null for example.com placeholders and failed fetches", async () => {
    const placeholder = await scrapeMailtoFromWebsite(
      "https://shop.com",
      htmlFetch('<a href="mailto:owner@example.com">e</a>'),
    );
    expect(placeholder).toBeNull();

    const failed = await scrapeMailtoFromWebsite("https://shop.com", htmlFetch("nope", 500));
    expect(failed).toBeNull();
  });
});

describe("HunterEmailEnricher", () => {
  it("returns the highest-confidence email from a domain search", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: {
            emails: [
              { value: "info@plumber.com", confidence: 40 },
              { value: "ada@plumber.com", confidence: 91 },
            ],
          },
        }),
        { status: 200 },
      )) as typeof fetch;

    const hunter = new HunterEmailEnricher(fetchImpl, "test-key");
    await expect(hunter.findEmail("plumber.com")).resolves.toEqual({
      email: "ada@plumber.com",
      confidence: 91,
    });
    expect(hunter.lookupCostMicroUsd).toBe(50_000);
  });

  it("returns null when Hunter has no emails", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ data: { emails: [] } }), { status: 200 })) as typeof fetch;
    const hunter = new HunterEmailEnricher(fetchImpl, "test-key");
    await expect(hunter.findEmail("empty.com")).resolves.toBeNull();
  });
});
