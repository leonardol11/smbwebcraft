import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Db } from "./client";
import { getDb } from "./client";
import { campaigns, campaignZips, leads, markets } from "./schema";
import { runMigrations } from "./migrate";

const FIRST_NAMES = ["Maria", "James", "Linda", "Carlos", "Amy", "Tony", "Nina", "Sam"];
const BUSINESS_KINDS = [
  { kind: "Nail Salon", category: "nail_salon" },
  { kind: "Plumbing", category: "plumber" },
  { kind: "Barber Shop", category: "barber_shop" },
  { kind: "Taqueria", category: "restaurant" },
  { kind: "Auto Repair", category: "car_repair" },
  { kind: "Bakery", category: "bakery" },
  { kind: "Cleaning Co", category: "cleaning_service" },
  { kind: "Landscaping", category: "landscaper" },
];
const STREET_NAMES = ["Main St", "Oak Ave", "Cedar Rd", "Elm St", "5th Ave", "Lamar Blvd"];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

export async function seed(db: Db, leadsPerCity = 25): Promise<void> {
  const cities = [
    { city: "Austin", state: "TX", slug: "austin-tx", zips: ["78701", "78704", "78745"] },
    { city: "Ithaca", state: "NY", slug: "ithaca-ny", zips: ["14850", "14853"] },
  ];

  for (const c of cities) {
    const [market] = await db
      .insert(markets)
      .values({ city: c.city, state: c.state, slug: c.slug })
      .onConflictDoNothing()
      .returning();
    if (!market) continue;

    const [campaign] = await db
      .insert(campaigns)
      .values({
        marketId: market.id,
        name: `${c.city} pilot`,
        categories: ["nail_salon", "plumber", "restaurant"],
        status: "draft",
        dailyCap: 25,
      })
      .returning();

    if (campaign) {
      await db
        .insert(campaignZips)
        .values(c.zips.map((zip) => ({ campaignId: campaign.id, zip })))
        .onConflictDoNothing();
    }

    const rows = Array.from({ length: leadsPerCity }, (_, i) => {
      const biz = pick(BUSINESS_KINDS, i);
      const name = `${pick(FIRST_NAMES, i)}'s ${biz.kind}`;
      const zip = pick(c.zips, i);
      const hasEmail = i % 3 !== 0;
      return {
        marketId: market.id,
        campaignId: campaign?.id ?? null,
        zip,
        businessName: name,
        ownerFirstName: i % 2 === 0 ? pick(FIRST_NAMES, i) : null,
        phone: `+1512555${String(1000 + i).slice(-4)}`,
        email: hasEmail ? `owner${i}@${c.slug.replace("-", "")}biz${i}.example.com` : null,
        emailConfidence: hasEmail ? 80 : null,
        address: `${100 + i} ${pick(STREET_NAMES, i)}, ${c.city}, ${c.state} ${zip}`,
        city: c.city,
        state: c.state,
        placesId: `seed-${c.slug}-${i}`,
        websiteUrl: null,
        category: biz.category,
        status: "qualified" as const,
        qualificationReason: "no_website",
        placesData: {
          rating: 4 + (i % 10) / 10,
          reviewCount: 10 + i,
          hours: { Mon: "9-5", Tue: "9-5", Wed: "9-5", Thu: "9-5", Fri: "9-5" },
          photoUrls: [],
          types: [biz.category],
        },
      };
    });

    await db.insert(leads).values(rows).onConflictDoNothing();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const count = process.env.SEED_LEADS ? Number(process.env.SEED_LEADS) : 25;
  runMigrations()
    .then(() => getDb())
    .then((db) => seed(db, count))
    .then(() => {
      console.log("Seed complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
