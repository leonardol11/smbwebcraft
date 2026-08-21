"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { campaigns, campaignZips, getDb, markets, type CampaignStatus } from "@outreach/db";
import { DEFAULT_CAMPAIGN_DAILY_CAP, MAX_CAMPAIGN_DAILY_CAP } from "@/lib/categories";

function slugify(city: string, state: string): string {
  return `${city}-${state}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createMarket(formData: FormData): Promise<void> {
  const city = String(formData.get("city") || "").trim();
  const state = String(formData.get("state") || "")
    .trim()
    .toUpperCase();
  if (!city || !/^[A-Z]{2}$/.test(state)) return;
  const db = await getDb();
  const slug = slugify(city, state);
  await db.insert(markets).values({ city, state, slug }).onConflictDoNothing();
  revalidatePath("/cities");
  redirect(`/cities/${slug}`);
}

export async function createCampaign(formData: FormData): Promise<void> {
  const marketId = String(formData.get("marketId") || "");
  const slug = String(formData.get("slug") || "");
  const name = String(formData.get("name") || "").trim();
  const requestedCap = Number(formData.get("dailyCap")) || DEFAULT_CAMPAIGN_DAILY_CAP;
  const dailyCap = Math.min(MAX_CAMPAIGN_DAILY_CAP, Math.max(1, Math.floor(requestedCap)));
  const categories = formData.getAll("categories").map(String);
  const zips = String(formData.get("zips") || "")
    .split(/[\s,;]+/)
    .map((z) => z.trim())
    .filter((z) => /^\d{5}$/.test(z));
  if (!marketId || !name || zips.length === 0) return;

  const db = await getDb();
  const [campaign] = await db
    .insert(campaigns)
    .values({ marketId, name, categories, dailyCap, status: "draft" })
    .returning();
  if (campaign) {
    await db
      .insert(campaignZips)
      .values([...new Set(zips)].map((zip) => ({ campaignId: campaign.id, zip })))
      .onConflictDoNothing();
  }
  revalidatePath(`/cities/${slug}`);
}

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["running"],
  running: ["paused"],
  paused: ["running"],
};

export async function setCampaignStatus(
  campaignId: string,
  next: CampaignStatus,
  slug: string,
): Promise<void> {
  const db = await getDb();
  const [current] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!current) return;
  if (!TRANSITIONS[current.status].includes(next)) return;
  await db.update(campaigns).set({ status: next }).where(eq(campaigns.id, campaignId));
  revalidatePath(`/cities/${slug}`);
}
