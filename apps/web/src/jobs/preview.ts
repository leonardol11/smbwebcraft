import { defineJob } from "./core";

/** Pre-generates the lead's preview site and caches the HTML so /preview/<leadId> is instant. */
defineJob("site.build_preview", async (input: { leadId: string }, { db }) => {
  const { buildAndStorePreview } = await import("@/lib/preview");
  const site = await buildAndStorePreview(db, input.leadId);
  return { siteId: site.id, slug: site.slug, previewUrl: site.previewUrl };
});
