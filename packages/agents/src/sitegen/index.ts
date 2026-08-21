import { randomBytes } from "node:crypto";
import { buildSite } from "@outreach/sites";
import { and, eq, clientSites, leads, type Db } from "@outreach/db";
import { env } from "@outreach/env";
import { logAgentAction } from "../shared/log-action";
import { createSiteCopyLlm } from "./live-copy-llm";
import type { SiteCopyLlm } from "./copy-llm";
import { mapLeadToSiteConfig } from "./map-config";
import { siteSlug, slugWithSuffix } from "./slug";
import type { SiteConfig, SiteTemplate } from "./schema";
import { pickTemplate } from "./template-picker";

export type GenerateSiteResult = {
  id: string;
  siteId: string;
  slug: string;
  html: string;
  template: SiteTemplate;
  preview: boolean;
  previewUrl?: string;
  config: SiteConfig;
};

async function allocateSlug(
  db: Db,
  base: string,
  leadId: string,
  isPreview: boolean,
): Promise<string> {
  const candidate = isPreview ? `preview-${base}` : base;
  const [taken] = await db
    .select({ slug: clientSites.slug, leadId: clientSites.leadId })
    .from(clientSites)
    .where(eq(clientSites.slug, candidate))
    .limit(1);
  if (!taken || taken.leadId === leadId) return candidate;

  const suffixed = slugWithSuffix(candidate, leadId.slice(0, 8));
  const [takenSuffix] = await db
    .select({ slug: clientSites.slug, leadId: clientSites.leadId })
    .from(clientSites)
    .where(eq(clientSites.slug, suffixed))
    .limit(1);
  if (!takenSuffix || takenSuffix.leadId === leadId) return suffixed;

  return slugWithSuffix(candidate, leadId.replace(/-/g, ""));
}

export async function generateSite(
  db: Db,
  leadId: string,
  options: { preview?: boolean; copyLlm?: SiteCopyLlm } = {},
): Promise<GenerateSiteResult> {
  const started = Date.now();
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const isPreview = options.preview ?? false;
  const template = pickTemplate(lead.category, lead.placesData?.types);
  const llm = createSiteCopyLlm(options.copyLlm);
  const generated = await llm.generateCopy({
    businessName: lead.businessName,
    category: lead.category,
    city: lead.city,
    template,
    placesData: lead.placesData,
  });

  const [existing] = await db
    .select()
    .from(clientSites)
    .where(and(eq(clientSites.leadId, leadId), eq(clientSites.isPreview, isPreview)))
    .limit(1);

  const baseSlug = siteSlug(lead.businessName, lead.city);
  const slug = existing?.slug ?? (await allocateSlug(db, baseSlug, leadId, isPreview));
  const config = mapLeadToSiteConfig(lead, generated.copy, template, slug, {
    mapsEmbedKey: env().GOOGLE_MAPS_EMBED_KEY,
  });
  const html = buildSite(template, config);

  const previewToken = existing?.previewToken ?? (isPreview ? randomBytes(16).toString("hex") : null);
  const previewUrl = isPreview
    ? (existing?.previewUrl ?? `${env().APP_URL}/preview/${slug}?token=${previewToken}`)
    : null;

  let site;
  if (existing) {
    const [updated] = await db
      .update(clientSites)
      .set({
        template,
        config,
        deployStatus: existing.deployStatus === "suspended" ? "suspended" : "building",
        deployError: null,
        updatedAt: new Date(),
      })
      .where(eq(clientSites.id, existing.id))
      .returning();
    site = updated ?? existing;
  } else {
    const [inserted] = await db
      .insert(clientSites)
      .values({
        leadId,
        slug,
        template,
        config,
        isPreview,
        previewToken,
        previewUrl,
        deployStatus: "building",
      })
      .returning();
    site = inserted;
  }

  if (!site) throw new Error("Failed to persist client_sites row");

  await logAgentAction(db, {
    agent: "sitegen",
    action: "generate_site",
    leadId,
    marketId: lead.marketId,
    input: { preview: isPreview, template },
    output: { siteId: site.id, slug },
    tokensIn: generated.tokensIn,
    tokensOut: generated.tokensOut,
    costMicroUsd: generated.costMicroUsd,
    durationMs: Date.now() - started,
  });

  return {
    id: site.id,
    siteId: site.id,
    slug,
    html,
    template,
    preview: isPreview,
    previewUrl: previewUrl ?? undefined,
    config,
  };
}

export { pickTemplate } from "./template-picker";
export { slugFromBusinessName, siteSlug } from "./slug";
export { siteConfigSchema, siteCopySchema, parseSiteCopy, type SiteConfig, type SiteTemplate } from "./schema";
export { createSiteCopyLlm, FakeSiteCopyLlm } from "./live-copy-llm";
export { mapLeadToSiteConfig, mapEmbedUrlFor } from "./map-config";
export { galleryImages } from "./images";
export { normalizeHours } from "./hours";
