import type { GeocodeResult, PlaceBusiness, PlacesClient, SearchNearbyResult } from "./places-client";

const ZIP_COORDS: Record<string, GeocodeResult> = {
  "78701": { lat: 30.2672, lng: -97.7431 },
  "78704": { lat: 30.241, lng: -97.769 },
  "78745": { lat: 30.1975, lng: -97.797 },
  "14850": { lat: 42.443, lng: -76.5019 },
  "14853": { lat: 42.4534, lng: -76.4735 },
};

function hashZip(zip: string): number {
  let h = 0;
  for (let i = 0; i < zip.length; i++) h = (h * 31 + zip.charCodeAt(i)) >>> 0;
  return h;
}

function fakeCoord(zip: string): GeocodeResult {
  if (ZIP_COORDS[zip]) return ZIP_COORDS[zip]!;
  const h = hashZip(zip);
  return { lat: 30 + (h % 1000) / 1000, lng: -97 - (h % 1000) / 1000 };
}

const WEBSITE_VARIANTS: Array<string | null> = [
  null,
  "https://facebook.com/biz",
  "https://www.yelp.com/biz/example",
  "https://joesplumbing.example.com",
  "https://instagram.com/localbiz",
  "https://linktr.ee/smallbiz",
  "https://business.site/my-shop",
  "https://real-domain-co.com",
];

function makeBusiness(zip: string, category: string, index: number, page: number): PlaceBusiness {
  const h = hashZip(`${zip}:${category}:${index}:${page}`);
  const website = WEBSITE_VARIANTS[(h + index) % WEBSITE_VARIANTS.length] ?? null;
  const city = zip.startsWith("787") ? "Austin" : zip.startsWith("148") ? "Ithaca" : "Demo City";
  const state = zip.startsWith("787") ? "TX" : zip.startsWith("148") ? "NY" : "ST";
  const n = index + 1 + page * 5;
  const name = `${category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} #${n}`;
  return {
    place_id: `fake-${zip}-${category}-${n}`,
    name,
    phone: `+1512555${String(1000 + ((h + index) % 9000)).slice(-4)}`,
    website,
    address: `${100 + index} Main St, ${city} ${zip}`,
    city,
    state,
    zip,
    types: [category],
    rating: 3.5 + (h % 15) / 10,
    reviewCount: 5 + (h % 120),
    photoUrls: [`places/fake-${zip}-${n}/photos/1`],
    hours: { Mon: "9-5", Tue: "9-5", Wed: "9-5", Thu: "9-5", Fri: "9-5" },
  };
}

export class FakePlacesClient implements PlacesClient {
  /** Last ZIP passed to geocodeZip, used when reverse-lookup of coords fails. */
  private lastZip = "00000";

  async geocodeZip(zip: string): Promise<GeocodeResult> {
    this.lastZip = zip;
    return fakeCoord(zip);
  }

  async searchNearby(params: {
    lat: number;
    lng: number;
    radius: number;
    category: string;
    pageToken?: string;
  }): Promise<SearchNearbyResult> {
    const page = params.pageToken ? Number.parseInt(params.pageToken, 10) : 0;
    const zipGuess =
      Object.entries(ZIP_COORDS).find(
        ([, c]) => Math.abs(c.lat - params.lat) < 0.05 && Math.abs(c.lng - params.lng) < 0.05,
      )?.[0] ?? this.lastZip;

    const businesses = Array.from({ length: 5 }, (_, i) =>
      makeBusiness(zipGuess, params.category, i, page),
    );

    const nextPageToken = page < 1 ? String(page + 1) : undefined;
    return { businesses, nextPageToken };
  }
}
