import { describe, expect, it, beforeEach } from "vitest";
import { agentActions, eq, clientSites, createTestDb, leads, markets, type Db } from "@outreach/db";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { siteConfigSchema } from "@outreach/sites";
import {
  createSiteCopyLlm,
  FakeSiteCopyLlm,
  generateSite,
  galleryImages,
  normalizeHours,
  parseSiteCopy,
  pickTemplate,
  slugFromBusinessName,
} from "./index";
import { FALLBACK_HOURS } from "./hours";
import type { SiteCopyLlm } from "./copy-llm";

beforeEach(() => {
  resetEnvForTests();
  process.env.PROVIDER_MODE = "fake";
  process.env.APP_URL = "http://localhost:3000";
  loadEnv(process.env);
});

describe("sitegen helpers", () => {
  it("slugifies business names deterministically", () => {
    expect(slugFromBusinessName("Joe's Plumbing & Co.")).toBe("joes-plumbing-co");
  });

  it("picks food/salon template for restaurants and salons", () => {
    expect(pickTemplate("restaurant")).toBe("food_salon");
    expect(pickTemplate("nail_salon")).toBe("food_salon");
    expect(pickTemplate("beauty_salon", ["hair_care"])).toBe("food_salon");
    expect(pickTemplate("plumber")).toBe("services");
  });

  it("uses FakeSiteCopyLlm when PROVIDER_MODE=fake", () => {
    expect(createSiteCopyLlm()).toBeInstanceOf(FakeSiteCopyLlm);
  });

  it("normalizes abbreviated Places hours", () => {
    expect(normalizeHours({ Mon: "9-5", Fri: "9-3", Sun: "Closed" })).toEqual({
      Monday: "9-5",
      Friday: "9-3",
      Sunday: "Closed",
    });
  });

  it("falls back to call-for-hours when Places hours are missing", () => {
    expect(normalizeHours(undefined)).toEqual(FALLBACK_HOURS);
    expect(normalizeHours({})).toEqual(FALLBACK_HOURS);
  });

  it("uses Places photo URLs and stocks when they are resource names", () => {
    const places = galleryImages(["https://lh3.googleusercontent.com/places/abc.jpg"], "seed");
    expect(places).toEqual(["https://lh3.googleusercontent.com/places/abc.jpg"]);

    const stock = galleryImages(["places/place-1/photos/abc"], "marias-taqueria");
    expect(stock).toEqual([
      "https://picsum.photos/seed/marias-taqueria-1/800/600",
      "https://picsum.photos/seed/marias-taqueria-2/800/600",
      "https://picsum.photos/seed/marias-taqueria-3/800/600",
    ]);
    expect(galleryImages(["places/place-1/photos/abc"], "marias-taqueria")).toEqual(stock);
  });

  it("parses LLM copy and coerces service objects to titles", () => {
    const copy = parseSiteCopy({
      tagline: "Local plumbing",
      about: "We fix leaks in Austin.",
      services: [{ title: "Drain cleaning", description: "ignored" }, "Water heaters"],
    });
    expect(copy.services).toEqual(["Drain cleaning", "Water heaters"]);
  });

  it("rejects copy that invents prices or awards", () => {
    expect(() =>
      parseSiteCopy({
        tagline: "Best in town",
        about: "Award-winning since 1999. Only $99.",
        services: ["Repairs"],
      }),
    ).toThrow(/invented claims/);
  });
});

describe("generateSite", () => {
  let db: Db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  async function insertLead(
    values: Partial<typeof leads.$inferInsert> & { businessName: string },
  ) {
    const [m] = await db
      .insert(markets)
      .values({
        city: "Austin",
        state: "TX",
        slug: `sg-${slugFromBusinessName(values.businessName)}-${values.category ?? "biz"}`,
      })
      .returning();
    const category = values.category ?? "restaurant";
    const [lead] = await db
      .insert(leads)
      .values({
        marketId: m!.id,
        zip: "78701",
        category,
        city: "Austin",
        state: "TX",
        status: "interested",
        address: "100 Congress Ave",
        phone: "(512) 555-0100",
        email: "maria@example.com",
        ...values,
        placesData: values.placesData ?? {
          types: [category],
          rating: 4.5,
          reviewCount: 88,
        },
      })
      .returning();
    return lead!;
  }

  it("creates client_sites row with validated config and built html", async () => {
    const lead = await insertLead({ businessName: "Maria's Taqueria" });

    const result = await generateSite(db, lead.id, { preview: true });
    expect(result.template).toBe("food_salon");
    expect(result.preview).toBe(true);
    expect(result.previewUrl).toContain(result.slug);
    expect(result.id).toBe(result.siteId);
    expect(result.html).toMatch(/^<!DOCTYPE html>/);
    expect(result.html).toContain("Maria&#x27;s Taqueria");

    const parsed = siteConfigSchema.parse(result.config);
    expect(parsed.name).toBe("Maria's Taqueria");
    expect(parsed.hours.Monday).toBe("Call for hours");
    expect(parsed.gallery[0]).toContain("picsum.photos/seed/");

    const [site] = await db.select().from(clientSites).where(eq(clientSites.id, result.siteId));
    expect(site?.config).toEqual(result.config);
    expect((site?.config as { name: string }).name).toBe("Maria's Taqueria");
  });

  it("maps Places hours, photos, category, and reviews into config and html", async () => {
    const photo = "https://lh3.googleusercontent.com/places/taqueria-1.jpg";
    const lead = await insertLead({
      businessName: "Maria's Taqueria",
      placesData: {
        types: ["restaurant"],
        rating: 4.5,
        reviewCount: 88,
        hours: { Mon: "9:00 AM – 9:00 PM", Sat: "10:00 AM – 10:00 PM", Sun: "Closed" },
        photoUrls: [photo],
      },
    });

    const result = await generateSite(db, lead.id);
    expect(result.config.hours).toEqual({
      Monday: "9:00 AM – 9:00 PM",
      Saturday: "10:00 AM – 10:00 PM",
      Sunday: "Closed",
    });
    expect(result.config.gallery).toEqual([photo]);
    expect(result.config.about).toContain("4.5");
    expect(result.config.about).toContain("88");
    expect(result.html).toContain("9:00 AM – 9:00 PM");
    expect(result.html).toContain(photo);
    expect(result.html).toContain("Dine in");
  });

  it("produces the same valid config and HTML for the same lead on repeat runs", async () => {
    const lead = await insertLead({
      businessName: "Maria's Taqueria",
      placesData: {
        types: ["restaurant"],
        rating: 4.5,
        reviewCount: 88,
        hours: { Monday: "9-9", Tuesday: "9-9" },
        photoUrls: ["https://lh3.googleusercontent.com/places/repeat.jpg"],
      },
    });

    const first = await generateSite(db, lead.id);
    const second = await generateSite(db, lead.id);

    expect(second.id).toBe(first.id);
    expect(second.siteId).toBe(first.siteId);
    expect(second.slug).toBe(first.slug);
    expect(second.config).toEqual(first.config);
    expect(second.html).toBe(first.html);
    siteConfigSchema.parse(second.config);

    const rows = await db.select().from(clientSites).where(eq(clientSites.leadId, lead.id));
    expect(rows).toHaveLength(1);
  });

  it("builds a valid services site with name, phone, and hours", async () => {
    const lead = await insertLead({
      businessName: "Joe's Plumbing",
      category: "plumber",
      placesData: { types: ["plumber"], hours: { Mon: "8-5", Sat: "Closed" } },
    });
    const result = await generateSite(db, lead.id);
    expect(result.template).toBe("services");
    expect(result.slug).toBe("joes-plumbing-austin");
    siteConfigSchema.parse(result.config);
    expect(result.html).toMatch(/^<!DOCTYPE html>/);
    expect(result.html).toContain("Joe&#x27;s Plumbing");
    expect(result.html).toContain("(512) 555-0100");
    expect(result.html).toContain("Monday");
    expect(result.html).toContain("8-5");
    expect(result.html).toContain('id="hours"');

    const [action] = await db.select().from(agentActions).where(eq(agentActions.leadId, lead.id));
    expect(action?.agent).toBe("sitegen");
    expect(action?.tokensIn).toBeGreaterThan(0);
  });

  it("keeps preview and live rows separate and idempotent per kind", async () => {
    const lead = await insertLead({ businessName: "Maria's Taqueria" });
    const preview = await generateSite(db, lead.id, { preview: true });
    const live = await generateSite(db, lead.id);
    const previewAgain = await generateSite(db, lead.id, { preview: true });

    expect(preview.slug).toBe("preview-marias-taqueria-austin");
    expect(live.slug).toBe("marias-taqueria-austin");
    expect(preview.id).not.toBe(live.id);
    expect(previewAgain.id).toBe(preview.id);

    const rows = await db.select().from(clientSites).where(eq(clientSites.leadId, lead.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.isPreview).sort()).toEqual([false, true]);
  });

  it("appends a suffix when another lead already owns the slug", async () => {
    const first = await insertLead({ businessName: "Maria's Taqueria" });
    const second = await insertLead({ businessName: "Maria's Taqueria", category: "cafe" });
    const a = await generateSite(db, first.id);
    const b = await generateSite(db, second.id);
    expect(a.slug).toBe("marias-taqueria-austin");
    expect(b.slug).toMatch(/^marias-taqueria-austin-[a-z0-9]{1,8}$/);
  });

  it("uses an injectable copy LLM", async () => {
    const lead = await insertLead({ businessName: "Joe's Plumbing", category: "plumber" });
    const copyLlm: SiteCopyLlm = {
      async generateCopy() {
        return {
          copy: {
            tagline: "Pipes done right",
            about: "Joe's Plumbing serves Austin with dependable plumber.",
            services: ["Drain cleaning"],
          },
          tokensIn: 1,
          tokensOut: 1,
          costMicroUsd: 0,
        };
      },
    };

    const result = await generateSite(db, lead.id, { copyLlm });
    expect(result.template).toBe("services");
    expect(result.config.tagline).toBe("Pipes done right");
    expect(result.config.services).toEqual(["Drain cleaning"]);
    expect(result.html).toContain("Pipes done right");
  });
});
