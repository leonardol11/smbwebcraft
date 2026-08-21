import { env } from "@outreach/env";
import type { GeocodeResult, PlaceBusiness, PlacesClient, SearchNearbyResult } from "./places-client";

type FetchImpl = typeof fetch;

type AddressComponent = { types: string[]; longText?: string; shortText?: string };

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  photos?: Array<{ name?: string }>;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

function parseAddressComponents(components: AddressComponent[]) {
  let city = "";
  let state = "";
  let zip = "";
  for (const c of components) {
    if (c.types.includes("locality")) city = c.longText ?? city;
    if (c.types.includes("administrative_area_level_1")) state = c.shortText ?? state;
    if (c.types.includes("postal_code")) zip = c.longText ?? zip;
  }
  return { city, state, zip };
}

function mapPlace(p: PlacesApiPlace): PlaceBusiness {
  const { city, state, zip } = parseAddressComponents(p.addressComponents ?? []);
  const hoursRaw = p.regularOpeningHours;
  const hours =
    hoursRaw?.weekdayDescriptions?.reduce<Record<string, string>>((acc, line) => {
      const [day, ...rest] = line.split(": ");
      if (day) acc[day] = rest.join(": ");
      return acc;
    }, {}) ?? null;

  // Store photo resource names, never API keys.
  const photos = p.photos ?? [];
  return {
    place_id: (p.id ?? "").trim(),
    name: p.displayName?.text ?? "Unknown",
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    address: p.formattedAddress ?? "",
    city,
    state,
    zip,
    types: p.types ?? [],
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    photoUrls: photos.map((ph) => ph.name).filter((n): n is string => Boolean(n)),
    hours,
  };
}

const PLACE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.regularOpeningHours",
  "nextPageToken",
].join(",");

/**
 * Live Places API (New) client.
 *
 * Nearby Search (New) does not paginate (max 20). Text Search (New) does, so
 * searchNearby is implemented as a location-restricted text search.
 */
export class LivePlacesClient implements PlacesClient {
  constructor(
    private readonly fetchImpl: FetchImpl = fetch,
    private readonly apiKeyOverride?: string,
  ) {}

  private apiKey(): string {
    const key = this.apiKeyOverride ?? env().GOOGLE_PLACES_API_KEY;
    if (!key) throw new Error("GOOGLE_PLACES_API_KEY is required in live mode");
    return key;
  }

  async geocodeZip(zip: string): Promise<GeocodeResult> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&key=${this.apiKey()}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`Geocode failed: ${res.status}`);
    const data = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    const loc = data.results?.[0]?.geometry?.location;
    if (!loc) throw new Error(`No geocode result for zip ${zip}`);
    return { lat: loc.lat, lng: loc.lng };
  }

  async searchNearby(params: {
    lat: number;
    lng: number;
    radius: number;
    category: string;
    pageToken?: string;
  }): Promise<SearchNearbyResult> {
    const key = this.apiKey();
    const textQuery = params.category.replace(/_/g, " ");
    const body: Record<string, unknown> = params.pageToken
      ? { pageToken: params.pageToken }
      : {
          textQuery,
          includedType: params.category,
          pageSize: 20,
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: { latitude: params.lat, longitude: params.lng },
              radius: params.radius,
            },
          },
        };

    const res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": PLACE_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Places search failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as {
      places?: PlacesApiPlace[];
      nextPageToken?: string;
    };

    return {
      businesses: (data.places ?? []).map(mapPlace),
      nextPageToken: data.nextPageToken,
    };
  }
}
