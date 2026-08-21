import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestDb,
  leads,
  markets,
  setDbForTests,
  type Db,
  type LeadStatus,
} from "@outreach/db";
import { listLeads, PAGE_SIZE } from "./query";
import { leadsHref, parseLeadFilters, parsePage } from "./params";

let db: Db;
let marketId: string;

const NOW = new Date("2026-08-20T12:00:00.000Z");
const LARGE = 5_000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Deterministic fixture used only in tests — does not change production seed. */
function leadSpec(i: number): {
  email: string | null;
  websiteUrl: string | null;
  status: LeadStatus;
  lastTouchAt: Date | null;
} {
  const lastTouchKind = Math.floor(i / 8) % 3;
  return {
    email: (i & 1) === 0 ? `owner${i}@example.com` : null,
    websiteUrl: (i & 2) === 0 ? null : `https://site${i}.example.com`,
    status: (i & 4) === 0 ? "qualified" : "discovered",
    lastTouchAt: lastTouchKind === 1 ? daysAgo(2) : lastTouchKind === 2 ? daysAgo(40) : null,
  };
}

async function insertLeads(count: number, start = 0): Promise<void> {
  const chunk = 250;
  for (let offset = start; offset < start + count; offset += chunk) {
    const n = Math.min(chunk, start + count - offset);
    await db.insert(leads).values(
      Array.from({ length: n }, (_, j) => {
        const i = offset + j;
        const spec = leadSpec(i);
        return {
          marketId,
          zip: "78701",
          businessName: `Biz ${i}`,
          placesId: `t10-page-${i}`,
          createdAt: new Date(NOW.getTime() + i),
          ...spec,
        };
      }),
    );
  }
}

beforeAll(async () => {
  db = await createTestDb();
  setDbForTests(db);
  const [market] = await db
    .insert(markets)
    .values({ city: "Austin", state: "TX", slug: "t10-austin" })
    .returning();
  marketId = market!.id;
  await insertLeads(LARGE);
}, 60_000);

describe("parseLeadFilters", () => {
  it("reads composable query params and ignores invalid values", () => {
    expect(
      parseLeadFilters({
        status: "qualified",
        has_email: "1",
        no_website: "1",
        last_touch: "never",
      }),
    ).toEqual({
      status: "qualified",
      hasEmail: "1",
      noWebsite: "1",
      lastTouch: "never",
    });
    expect(parseLeadFilters({ status: "nope", has_email: "yes", last_touch: "tomorrow" })).toEqual({
      status: undefined,
      hasEmail: undefined,
      noWebsite: undefined,
      lastTouch: undefined,
    });
    expect(parsePage({ page: "3" })).toBe(3);
    expect(parsePage({ page: "-2" })).toBe(1);
  });

  it("preserves filters when building pagination hrefs", () => {
    const href = leadsHref(
      "austin-tx",
      { tab: "leads", status: "qualified", has_email: "1", page: "2" },
      { page: "3" },
    );
    expect(href).toContain("tab=leads");
    expect(href).toContain("status=qualified");
    expect(href).toContain("has_email=1");
    expect(href).toContain("page=3");
  });
});

describe("listLeads pagination (5,000)", () => {
  it("pages a 5,000-lead set in 50-row slices with a stable order", async () => {
    const first = await listLeads(db, { marketId, page: 1, now: NOW });
    expect(first.total).toBe(LARGE);
    expect(first.pageSize).toBe(PAGE_SIZE);
    expect(first.rows).toHaveLength(50);
    expect(first.totalPages).toBe(100);

    const second = await listLeads(db, { marketId, page: 2, now: NOW });
    expect(second.rows).toHaveLength(50);
    const firstIds = new Set(first.rows.map((r) => r.id));
    expect(second.rows.some((r) => firstIds.has(r.id))).toBe(false);
    expect(first.rows[0]!.businessName).toBe("Biz 0");
    expect(second.rows[0]!.businessName).toBe("Biz 50");

    const last = await listLeads(db, { marketId, page: 100, now: NOW });
    expect(last.rows).toHaveLength(50);
    expect(last.rows[0]!.businessName).toBe("Biz 4950");
    expect(last.rows[49]!.businessName).toBe("Biz 4999");

    const pastEnd = await listLeads(db, { marketId, page: 101, now: NOW });
    expect(pastEnd.rows).toHaveLength(0);
    expect(pastEnd.total).toBe(LARGE);
  }, 30_000);
});

describe("listLeads combined filters", () => {
  it("ANDs status, has_email, no_website, and last_touch", async () => {
    const expected = Array.from({ length: LARGE }, (_, i) => i).filter((i) => {
      const spec = leadSpec(i);
      return (
        spec.status === "qualified" &&
        spec.email !== null &&
        spec.websiteUrl === null &&
        spec.lastTouchAt === null
      );
    });

    const result = await listLeads(db, {
      marketId,
      page: 1,
      now: NOW,
      filters: {
        status: "qualified",
        hasEmail: "1",
        noWebsite: "1",
        lastTouch: "never",
      },
    });

    expect(result.total).toBe(expected.length);
    expect(result.total).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.status === "qualified")).toBe(true);
    expect(result.rows.every((r) => r.email)).toBe(true);
    expect(result.rows.every((r) => r.websiteUrl === null)).toBe(true);
    expect(result.rows.every((r) => r.lastTouchAt === null)).toBe(true);

    const page2 = await listLeads(db, {
      marketId,
      page: 2,
      now: NOW,
      filters: {
        status: "qualified",
        hasEmail: "1",
        noWebsite: "1",
        lastTouch: "never",
      },
    });
    const ids = new Set(result.rows.map((r) => r.id));
    expect(page2.rows.some((r) => ids.has(r.id))).toBe(false);
  });

  it("last-touch 7d vs older select disjoint windows", async () => {
    const recent = await listLeads(db, {
      marketId,
      filters: { lastTouch: "7d" },
      now: NOW,
      pageSize: 5,
    });
    const older = await listLeads(db, {
      marketId,
      filters: { lastTouch: "older" },
      now: NOW,
      pageSize: 5,
    });
    expect(recent.total).toBeGreaterThan(0);
    expect(older.total).toBeGreaterThan(0);
    expect(recent.rows.every((r) => r.lastTouchAt && r.lastTouchAt.getTime() >= daysAgo(7).getTime())).toBe(
      true,
    );
    expect(older.rows.every((r) => r.lastTouchAt && r.lastTouchAt.getTime() < daysAgo(30).getTime())).toBe(
      true,
    );

    const never = await listLeads(db, {
      marketId,
      filters: { lastTouch: "never" },
      now: NOW,
      pageSize: 1,
    });
    expect(never.rows[0]!.lastTouchAt).toBeNull();
  });

  it("has_email=0 excludes addresses even when other filters match", async () => {
    const result = await listLeads(db, {
      marketId,
      filters: { status: "qualified", hasEmail: "0", noWebsite: "1" },
      now: NOW,
    });
    expect(result.total).toBeGreaterThan(0);
    expect(result.rows.every((r) => r.email === null)).toBe(true);
    expect(result.rows.every((r) => r.status === "qualified")).toBe(true);
    expect(result.rows.every((r) => r.websiteUrl === null)).toBe(true);
  });
});
