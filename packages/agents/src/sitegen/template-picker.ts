import type { SiteTemplate } from "./schema";

const FOOD_SALON_CATEGORIES = [
  "restaurant",
  "bakery",
  "cafe",
  "food",
  "meal_delivery",
  "meal_takeaway",
  "salon",
  "hair_salon",
  "nail_salon",
  "beauty_salon",
  "spa",
  "barber",
  "barber_shop",
  "hair_care",
] as const;

export function pickTemplate(category: string | null | undefined, types?: string[]): SiteTemplate {
  const haystack = [category ?? "", ...(types ?? [])].join(" ").toLowerCase();
  if (FOOD_SALON_CATEGORIES.some((c) => haystack.includes(c))) return "food_salon";
  return "services";
}
