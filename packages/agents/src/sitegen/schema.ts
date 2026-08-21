import { z } from "zod";
import { siteConfigSchema, type SiteConfig } from "@outreach/sites";

export { siteConfigSchema, type SiteConfig };

export const siteTemplateSchema = z.enum(["services", "food_salon"]);
export type SiteTemplate = z.infer<typeof siteTemplateSchema>;

/** LLM-owned slots. Facts (name, hours, phone, photos) are filled in code. */
export const siteCopySchema = z.object({
  tagline: z.string().min(1),
  about: z.string().min(1),
  services: z.array(z.string().min(1)).min(1).max(6),
});

export type SiteCopy = z.infer<typeof siteCopySchema>;

const INVENTED_CLAIM = /\$\d|\baward|\bcertified\b|\b#1\b|\bsince\s+19|\bsince\s+20/i;

export function assertHonestCopy(copy: SiteCopy): void {
  const blob = [copy.tagline, copy.about, ...copy.services].join(" ");
  if (INVENTED_CLAIM.test(blob)) {
    throw new Error("Site copy invented claims (prices, awards, or founding years)");
  }
}

function serviceTitle(entry: unknown): string | null {
  if (typeof entry === "string" && entry.trim()) return entry.trim();
  if (entry && typeof entry === "object" && "title" in entry) {
    const title = (entry as { title: unknown }).title;
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return null;
}

/** Coerce LLM JSON into validated copy. Accepts services as strings or {title, description}. */
export function parseSiteCopy(raw: unknown): SiteCopy {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Site copy must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const services = Array.isArray(obj.services)
    ? obj.services.map(serviceTitle).filter((s): s is string => Boolean(s))
    : [];
  const copy = siteCopySchema.parse({
    tagline: obj.tagline,
    about: obj.about,
    services,
  });
  assertHonestCopy(copy);
  return copy;
}
