import { describe, expect, it } from "vitest";
import { LivePlacesClient } from "./live-places";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("LivePlacesClient", () => {
  it("geocodes a ZIP via the Geocoding API", async () => {
    const calls: string[] = [];
    const client = new LivePlacesClient(async (input) => {
      calls.push(String(input));
      return jsonResponse({
        results: [{ geometry: { location: { lat: 30.2672, lng: -97.7431 } } }],
      });
    }, "test-key");

    const loc = await client.geocodeZip("78701");
    expect(loc).toEqual({ lat: 30.2672, lng: -97.7431 });
    expect(calls[0]).toContain("maps.googleapis.com/maps/api/geocode/json");
    expect(calls[0]).toContain("78701");
  });

  it("searches with Places API (New) Text Search and paginates", async () => {
    const bodies: unknown[] = [];
    const client = new LivePlacesClient(async (input, init) => {
      expect(String(input)).toBe("https://places.googleapis.com/v1/places:searchText");
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) {
        return jsonResponse({
          places: [
            {
              id: "place-1",
              displayName: { text: "Sam's Plumbing" },
              formattedAddress: "100 Main St, Austin, TX 78701",
              addressComponents: [
                { types: ["locality"], longText: "Austin" },
                { types: ["administrative_area_level_1"], shortText: "TX" },
                { types: ["postal_code"], longText: "78701" },
              ],
              nationalPhoneNumber: "(512) 555-0100",
              websiteUri: "https://example.com",
              types: ["plumber"],
              rating: 4.5,
              userRatingCount: 12,
              photos: [{ name: "places/place-1/photos/abc" }],
              regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] },
            },
          ],
          nextPageToken: "page-2",
        });
      }
      return jsonResponse({ places: [] });
    }, "test-key");

    const first = await client.searchNearby({
      lat: 30.26,
      lng: -97.74,
      radius: 8000,
      category: "plumber",
    });
    expect(first.businesses).toHaveLength(1);
    expect(first.nextPageToken).toBe("page-2");
    expect(first.businesses[0]).toMatchObject({
      place_id: "place-1",
      name: "Sam's Plumbing",
      city: "Austin",
      state: "TX",
      zip: "78701",
      photoUrls: ["places/place-1/photos/abc"],
    });
    expect(JSON.stringify(first.businesses[0]?.photoUrls)).not.toContain("test-key");

    const second = await client.searchNearby({
      lat: 30.26,
      lng: -97.74,
      radius: 8000,
      category: "plumber",
      pageToken: first.nextPageToken,
    });
    expect(second.businesses).toHaveLength(0);
    expect(bodies[0]).toMatchObject({
      textQuery: "plumber",
      includedType: "plumber",
      pageSize: 20,
    });
    expect(bodies[1]).toEqual({ pageToken: "page-2" });
  });
});
