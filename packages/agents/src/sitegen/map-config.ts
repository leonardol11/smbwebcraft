import { z } from "zod";
import type { PlacesData } from "@outreach/db";
import { siteConfigSchema, type SiteConfig } from "@outreach/sites";
import { galleryImages } from "./images";
import { normalizeHours } from "./hours";
import type { SiteCopy, SiteTemplate } from "./schema";

export type LeadSiteFacts = {
  businessName: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string;
  placesData?: PlacesData | null;
};

function optionalEmail(value: string | null | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = z.string().email().safeParse(value.trim());
  return parsed.success ? parsed.data : undefined;
}

function emailSafeSlug(slug: string): string {
  const cleaned = slug.replace(/[^a-z0-9-]/gi, "").replace(/^-+|-+$/g, "").toLowerCase();
  return cleaned || "business";
}

function requiredText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function primaryColor(template: SiteTemplate): string {
  return template === "food_salon" ? "#c2410c" : "#1d4ed8";
}

function mapQuery(address: string, city: string, state: string, zip: string): string {
  return `${address}, ${city}, ${state} ${zip}`;
}

/**
 * Google Maps Embed API URL when GOOGLE_MAPS_EMBED_KEY is set; otherwise the
 * template falls back to the keyless maps.google.com embed built from mapQuery.
 */
export function mapEmbedUrlFor(query: string, embedKey?: string | null): string | undefined {
  if (!embedKey) return undefined;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(query)}`;
}

/** Map lead facts + validated LLM copy into a T21 template config. */
export function mapLeadToSiteConfig(
  lead: LeadSiteFacts,
  copy: SiteCopy,
  template: SiteTemplate,
  slug: string,
  options: { mapsEmbedKey?: string | null } = {},
): SiteConfig {
  const city = requiredText(lead.city, "Local");
  const state = requiredText(lead.state, "US");
  const zip = requiredText(lead.zip, "00000");
  const address = requiredText(lead.address, "Address on request");
  const email = optionalEmail(lead.email);
  const contactEmail = email ?? `hello@${emailSafeSlug(slug)}.example.com`;

  return siteConfigSchema.parse({
    name: lead.businessName,
    tagline: copy.tagline,
    about: copy.about,
    services: copy.services,
    hours: normalizeHours(lead.placesData?.hours),
    phone: requiredText(lead.phone, "Call for details"),
    email,
    address,
    city,
    state,
    zip,
    mapQuery: mapQuery(address, city, state, zip),
    mapEmbedUrl: mapEmbedUrlFor(mapQuery(address, city, state, zip), options.mapsEmbedKey),
    gallery: galleryImages(lead.placesData?.photoUrls, slug),
    contactEmail,
    primaryColor: primaryColor(template),
  });
}
