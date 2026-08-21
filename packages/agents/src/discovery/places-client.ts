export type PlaceBusiness = {
  place_id: string;
  name: string;
  phone: string | null;
  website: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  types: string[];
  rating: number | null;
  reviewCount: number | null;
  photoUrls: string[];
  hours: Record<string, string> | null;
};

export type GeocodeResult = { lat: number; lng: number };

export type SearchNearbyParams = {
  lat: number;
  lng: number;
  radius: number;
  category: string;
  pageToken?: string;
};

export type SearchNearbyResult = {
  businesses: PlaceBusiness[];
  nextPageToken?: string;
};

export interface PlacesClient {
  geocodeZip(zip: string): Promise<GeocodeResult>;
  searchNearby(params: SearchNearbyParams): Promise<SearchNearbyResult>;
}
