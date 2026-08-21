import { and, eq, clientSites, leads, type Db } from "@outreach/db";
import { generateSite } from "@outreach/agents/sitegen";
import { getFakeDeployedHtml } from "@outreach/sites";
import { payUrl } from "@/lib/stripe";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Generates (or regenerates) the preview site and caches its HTML on client_sites. */
export async function buildAndStorePreview(db: Db, leadId: string) {
  const site = await generateSite(db, leadId, { preview: true });
  await db
    .update(clientSites)
    .set({ html: site.html, updatedAt: new Date() })
    .where(eq(clientSites.id, site.id));
  return site;
}

/** Cached preview HTML if present (db, then fake deploy store), else build on the fly. */
export async function getOrBuildPreview(db: Db, leadId: string): Promise<string> {
  const [row] = await db
    .select({ html: clientSites.html, slug: clientSites.slug })
    .from(clientSites)
    .where(and(eq(clientSites.leadId, leadId), eq(clientSites.isPreview, true)))
    .limit(1);
  if (row?.html) return row.html;
  if (row?.slug) {
    const fake = getFakeDeployedHtml(row.slug);
    if (fake) return fake;
  }
  const site = await buildAndStorePreview(db, leadId);
  return site.html;
}

/** Injects the fixed "this is a preview — go live" banner into a site's HTML. */
export function buildPreviewHtml(
  html: string,
  lead: Pick<typeof leads.$inferSelect, "id" | "businessName">,
): string {
  const pay = payUrl(lead.id);
  const banner = `<div id="outreach-preview-banner" style="position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;box-shadow:0 1px 4px rgba(0,0,0,.3)">
  <span>This is a preview for <strong>${escapeHtml(lead.businessName)}</strong>. Go live for $100 + $25/mo &rarr;</span>
  <a href="${escapeHtml(pay)}" style="background:#22c55e;color:#052e16;font-weight:600;padding:6px 14px;border-radius:6px;text-decoration:none">Go live</a>
</div>
<div style="height:48px"></div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body[^>]*>/i, (m) => `${m}\n${banner}`);
  }
  return `${banner}\n${html}`;
}
