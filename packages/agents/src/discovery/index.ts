import { eq, campaignZips, campaigns, leads, assertNotPaused, type Db } from "@outreach/db";
import { env } from "@outreach/env";
import { normalizeNameAddress, normalizePhone } from "../shared/normalize";
import { logAgentAction } from "../shared/log-action";
import { FakePlacesClient } from "./fake-places";
import { LivePlacesClient } from "./live-places";
import type { PlaceBusiness, PlacesClient } from "./places-client";

export type { PlaceBusiness, PlacesClient } from "./places-client";
export { FakePlacesClient } from "./fake-places";
export { LivePlacesClient } from "./live-places";

export function createPlacesClient(client?: PlacesClient): PlacesClient {
  if (client) return client;
  return env().PROVIDER_MODE === "live" ? new LivePlacesClient() : new FakePlacesClient();
}

export type DiscoverResult = {
  created: number;
  skippedDuplicates: number;
  requests: number;
};

export const DEFAULT_MAX_REQUESTS_PER_RUN = 40;
const SEARCH_RADIUS_METERS = 8000;

function leadFromBusiness(
  biz: PlaceBusiness,
  marketId: string,
  campaignId: string,
  category: string,
  zip: string,
) {
  const placeId = biz.place_id.trim() || null;
  return {
    marketId,
    campaignId,
    zip: biz.zip || zip,
    businessName: biz.name,
    phone: biz.phone,
    address: biz.address,
    city: biz.city,
    state: biz.state,
    placesId: placeId,
    websiteUrl: biz.website,
    category,
    status: "discovered" as const,
    placesData: {
      rating: biz.rating ?? undefined,
      reviewCount: biz.reviewCount ?? undefined,
      hours: biz.hours ?? undefined,
      photoUrls: biz.photoUrls,
      types: biz.types,
    },
  };
}

export async function discoverCampaign(
  db: Db,
  campaignId: string,
  options: { maxRequestsPerRun?: number; placesClient?: PlacesClient } = {},
): Promise<DiscoverResult> {
  const started = Date.now();
  await assertNotPaused(db, "discovery_paused");

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw new Error(`Campaign not found: ${campaignId}`);

  const zips = await db.select().from(campaignZips).where(eq(campaignZips.campaignId, campaignId));
  if (zips.length === 0) throw new Error(`Campaign ${campaignId} has no zips`);

  // places_id is globally unique in the schema; phone and name+address are
  // scoped to the market so two cities can share a "100 Main St" without colliding.
  const existingLeads = await db
    .select({
      placesId: leads.placesId,
      phone: leads.phone,
      businessName: leads.businessName,
      address: leads.address,
      marketId: leads.marketId,
    })
    .from(leads);

  const seenPlaces = new Set(
    existingLeads.map((l) => l.placesId?.trim()).filter((id): id is string => Boolean(id)),
  );
  const marketLeads = existingLeads.filter((l) => l.marketId === campaign.marketId);
  const seenPhones = new Set(
    marketLeads.map((l) => normalizePhone(l.phone)).filter((p): p is string => Boolean(p)),
  );
  const seenNameAddr = new Set(
    marketLeads.map((l) => normalizeNameAddress(l.businessName, l.address ?? "")),
  );

  const client = createPlacesClient(options.placesClient);
  const maxRequests = options.maxRequestsPerRun ?? DEFAULT_MAX_REQUESTS_PER_RUN;
  let requests = 0;
  let created = 0;
  let skippedDuplicates = 0;

  for (const { zip } of zips) {
    if (requests >= maxRequests) break;
    const { lat, lng } = await client.geocodeZip(zip);
    requests++;

    for (const category of campaign.categories) {
      if (requests >= maxRequests) break;

      let pageToken: string | undefined;
      do {
        if (requests >= maxRequests) break;
        const result = await client.searchNearby({
          lat,
          lng,
          radius: SEARCH_RADIUS_METERS,
          category,
          pageToken,
        });
        requests++;

        for (const biz of result.businesses) {
          const placeId = biz.place_id.trim() || null;
          const phoneKey = normalizePhone(biz.phone);
          const nameAddrKey = normalizeNameAddress(biz.name, biz.address);

          if (placeId && seenPlaces.has(placeId)) {
            skippedDuplicates++;
            continue;
          }
          if (phoneKey && seenPhones.has(phoneKey)) {
            skippedDuplicates++;
            continue;
          }
          if (seenNameAddr.has(nameAddrKey)) {
            skippedDuplicates++;
            continue;
          }

          if (placeId) seenPlaces.add(placeId);
          if (phoneKey) seenPhones.add(phoneKey);
          seenNameAddr.add(nameAddrKey);

          await db.insert(leads).values(leadFromBusiness(biz, campaign.marketId, campaignId, category, zip));
          created++;
        }

        pageToken = result.nextPageToken;
      } while (pageToken && requests < maxRequests);
    }
  }

  await logAgentAction(db, {
    agent: "discovery",
    action: "discover_campaign",
    marketId: campaign.marketId,
    input: { campaignId, maxRequestsPerRun: maxRequests },
    output: { created, skippedDuplicates, requests },
    durationMs: Date.now() - started,
  });

  return { created, skippedDuplicates, requests };
}
