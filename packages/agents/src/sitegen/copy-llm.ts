import type { PlacesData } from "@outreach/db";
import { parseSiteCopy, type SiteCopy, type SiteTemplate } from "./schema";

export type CopyInput = {
  businessName: string;
  category: string | null;
  city: string | null;
  template: SiteTemplate;
  placesData?: PlacesData | null;
};

export interface SiteCopyLlm {
  generateCopy(input: CopyInput): Promise<{
    copy: SiteCopy;
    tokensIn: number;
    tokensOut: number;
    costMicroUsd: number;
  }>;
}

function niche(input: CopyInput): "food" | "salon" | "services" {
  if (input.template !== "food_salon") return "services";
  const hay = [input.category ?? "", ...(input.placesData?.types ?? [])].join(" ").toLowerCase();
  if (/salon|spa|barber|nail|hair|beauty/.test(hay)) return "salon";
  return "food";
}

function reviewSentence(input: CopyInput): string {
  const rating = input.placesData?.rating;
  if (typeof rating !== "number") return "";
  const count = input.placesData?.reviewCount;
  const reviews = typeof count === "number" ? ` from ${count} reviews` : "";
  return ` Rated ${rating.toFixed(1)}${reviews}.`;
}

function categoryLabel(category: string | null): string {
  return (category ?? "local business").replace(/_/g, " ");
}

export class FakeSiteCopyLlm implements SiteCopyLlm {
  async generateCopy(input: CopyInput) {
    const category = categoryLabel(input.category);
    const city = input.city ?? "your area";
    const kind = niche(input);
    const reviews = reviewSentence(input);

    const copy = parseSiteCopy({
      tagline:
        kind === "food"
          ? `Fresh flavors in ${city}`
          : kind === "salon"
            ? `Look your best in ${city}`
            : `Trusted ${category} in ${city}`,
      about:
        kind === "food"
          ? `${input.businessName} serves ${city} with great food and hospitality.${reviews}`
          : kind === "salon"
            ? `${input.businessName} serves ${city} with skilled stylists and a welcoming chair.${reviews}`
            : `${input.businessName} serves ${city} with dependable ${category}.${reviews}`,
      services:
        kind === "food"
          ? ["Dine in", "Takeout", "Catering"]
          : kind === "salon"
            ? ["Haircuts", "Color", "Styling"]
            : [`${category} you can trust`, "Free estimates", "Fast response"],
    });

    return { copy, tokensIn: 80, tokensOut: 120, costMicroUsd: 0 };
  }
}
