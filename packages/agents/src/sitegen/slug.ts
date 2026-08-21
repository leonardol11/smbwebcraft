export function slugify(value: string, max = 48): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max)
    .replace(/-$/, "");
}

export function slugFromBusinessName(name: string): string {
  return slugify(name) || "business";
}

/** `<business-slug>-<city-slug>`; city omitted when unknown. */
export function siteSlug(businessName: string, city: string | null | undefined): string {
  const business = slugFromBusinessName(businessName);
  const citySlug = city ? slugify(city, 24) : "";
  return citySlug ? `${business}-${citySlug}` : business;
}

/** Deterministic suffix when slug collides. */
export function slugWithSuffix(base: string, suffix: string): string {
  const clean = suffix.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return clean ? `${base}-${clean}` : base;
}
