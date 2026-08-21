/**
 * Hard ceiling for a single campaign's daily send cap. Matches the global
 * 450 outbound emails/day maximum enforced by the sequence engine — a
 * per-campaign cap may be lower, never higher.
 */
export const MAX_CAMPAIGN_DAILY_CAP = 450;

/** Default daily cap for newly created campaigns. */
export const DEFAULT_CAMPAIGN_DAILY_CAP = 25;

/** Business categories offered when creating a campaign (Places API types). */
export const BUSINESS_CATEGORIES = [
  "nail_salon",
  "hair_salon",
  "barber_shop",
  "plumber",
  "electrician",
  "hvac_contractor",
  "restaurant",
  "bakery",
  "car_repair",
  "cleaning_service",
  "landscaper",
  "moving_company",
] as const;

export function labelForCategory(cat: string): string {
  return cat.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
