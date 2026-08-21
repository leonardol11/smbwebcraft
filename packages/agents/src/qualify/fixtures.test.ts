import { describe, expect, it } from "vitest";
import { createTestDb, eq, leads, markets } from "@outreach/db";
import { qualifyLead } from "./index";
import { qualifyWebsite, type QualificationReason } from "./rules";

type Fixture = {
  name: string;
  url: string | null | undefined;
  expectedQualifies: boolean;
  expectedReason: QualificationReason;
  mockHtml?: string;
  mockStatus?: number;
  mockError?: boolean;
  mockFinalUrl?: string;
};

const FIXTURES: Fixture[] = [
  { name: "null", url: null, expectedQualifies: true, expectedReason: "no_website" },
  { name: "undefined", url: undefined, expectedQualifies: true, expectedReason: "no_website" },
  { name: "empty string", url: "", expectedQualifies: true, expectedReason: "no_website" },
  { name: "whitespace", url: "   ", expectedQualifies: true, expectedReason: "no_website" },
  { name: "invalid url", url: "not-a-url", expectedQualifies: true, expectedReason: "no_website" },
  {
    name: "facebook",
    url: "https://facebook.com/mybiz",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "www facebook",
    url: "https://www.facebook.com/page",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "instagram",
    url: "https://instagram.com/shop",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "yelp",
    url: "https://yelp.com/biz/foo",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "linktree",
    url: "https://linktr.ee/biz",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "google business.site",
    url: "https://myshop.business.site",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "404 dead",
    url: "https://dead.example.com",
    expectedQualifies: true,
    expectedReason: "dead_site",
    mockStatus: 404,
  },
  {
    name: "network error",
    url: "https://error.example.com",
    expectedQualifies: true,
    expectedReason: "dead_site",
    mockError: true,
  },
  {
    name: "parked title",
    url: "https://parked.example.com",
    expectedQualifies: true,
    expectedReason: "parked",
    mockHtml: "<html><title>Domain Parked</title></html>",
  },
  {
    name: "coming soon",
    url: "https://soon.example.com",
    expectedQualifies: true,
    expectedReason: "parked",
    mockHtml: "<html><body>Coming soon to this domain</body></html>",
  },
  {
    name: "live https site",
    url: "https://realco.example.com",
    expectedQualifies: false,
    expectedReason: "has_website",
    mockHtml: "<html><title>Real Plumbing Co</title><body>Services</body></html>",
  },
  {
    name: "bare host (no scheme)",
    url: "realco.example.com",
    expectedQualifies: false,
    expectedReason: "has_website",
    mockHtml: "<html><title>Real Plumbing Co</title></html>",
  },
  {
    name: "live http site",
    url: "http://bakery.example.org",
    expectedQualifies: false,
    expectedReason: "has_website",
    mockHtml: "<html><title>Bakery</title></html>",
  },
  {
    name: "m.facebook.com",
    url: "https://m.facebook.com/page",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "biz.yelp.com",
    url: "https://biz.yelp.com/foo",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "www instagram",
    url: "https://www.instagram.com/shop",
    expectedQualifies: true,
    expectedReason: "social_only",
  },
  {
    name: "500 error",
    url: "https://error500.example.com",
    expectedQualifies: true,
    expectedReason: "dead_site",
    mockStatus: 500,
  },
  {
    name: "domain for sale",
    url: "https://forsale.example.com",
    expectedQualifies: true,
    expectedReason: "parked",
    mockHtml: "<html><body>This domain is for sale</body></html>",
  },
  {
    name: "redirects to facebook",
    url: "https://redirect-to-fb.example.com",
    expectedQualifies: true,
    expectedReason: "social_only",
    mockFinalUrl: "https://www.facebook.com/mybiz",
    mockHtml: "<html>facebook</html>",
  },
];

function mockFetch(fixture: Fixture): typeof fetch {
  return (async () => {
    if (fixture.mockError) throw new Error("network error");
    const status = fixture.mockStatus ?? 200;
    return {
      ok: status < 400,
      status,
      url: fixture.mockFinalUrl ?? (fixture.url?.includes("://") ? fixture.url : `https://${fixture.url}`),
      text: async () => fixture.mockHtml ?? "<html></html>",
    } as Response;
  }) as typeof fetch;
}

describe("qualifyWebsite fixtures", () => {
  it("covers at least 20 URL cases", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
  });

  it.each(FIXTURES)("$name → $expectedReason", async (fixture) => {
    const result = await qualifyWebsite(fixture.url, mockFetch(fixture));
    expect(result.qualifies).toBe(fixture.expectedQualifies);
    expect(result.reason).toBe(fixture.expectedReason);
  });
});

describe("qualifyLead persistence", () => {
  it("persists qualification_reason for a missing website", async () => {
    const db = await createTestDb();
    const [m] = await db.insert(markets).values({ city: "A", state: "TX", slug: "qualify-a" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({ marketId: m!.id, zip: "78701", businessName: "Biz", websiteUrl: null })
      .returning();

    const result = await qualifyLead(db, lead!.id);
    expect(result.status).toBe("qualified");
    expect(result.reason).toBe("no_website");

    const [row] = await db.select().from(leads).where(eq(leads.id, lead!.id));
    expect(row?.status).toBe("qualified");
    expect(row?.qualificationReason).toBe("no_website");
  });

  it("persists social_only without fetching", async () => {
    const db = await createTestDb();
    const [m] = await db.insert(markets).values({ city: "B", state: "TX", slug: "qualify-b" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: m!.id,
        zip: "78701",
        businessName: "FB Shop",
        websiteUrl: "https://facebook.com/fbshop",
      })
      .returning();

    const result = await qualifyLead(db, lead!.id, async () => {
      throw new Error("fetch should not run for social-only hosts");
    });
    expect(result.status).toBe("qualified");
    expect(result.reason).toBe("social_only");

    const [row] = await db.select().from(leads).where(eq(leads.id, lead!.id));
    expect(row?.qualificationReason).toBe("social_only");
  });

  it("persists skipped + has_website for a live site", async () => {
    const db = await createTestDb();
    const [m] = await db.insert(markets).values({ city: "C", state: "TX", slug: "qualify-c" }).returning();
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: m!.id,
        zip: "78701",
        businessName: "Real Co",
        websiteUrl: "https://realco.example.com",
      })
      .returning();

    const fetchImpl = (async () =>
      ({
        ok: true,
        status: 200,
        url: "https://realco.example.com",
        text: async () => "<html><title>Real Co</title></html>",
      }) as Response) as typeof fetch;

    const result = await qualifyLead(db, lead!.id, fetchImpl);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("has_website");

    const [row] = await db.select().from(leads).where(eq(leads.id, lead!.id));
    expect(row?.status).toBe("skipped");
    expect(row?.qualificationReason).toBe("has_website");
  });
});
