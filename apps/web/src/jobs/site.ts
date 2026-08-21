import { env } from "@outreach/env";
import { eq } from "drizzle-orm";
import { agentActions, clientSites, deals, leads } from "@outreach/db";
import { generateSite } from "@outreach/agents/sitegen";
import { buildSite, deploySiteHtml, suspendSite, unsuspendSite, type TemplateName } from "@outreach/sites";
import { createEmailClient, fromAddress } from "@outreach/email";
import { defineJob } from "./core";

/**
 * Generates the site for a lead (T22) and deploys it (T23).
 * Preview runs deploy to a throwaway preview host; live runs attach the custom
 * domain, link the deal, and email the owner.
 */
defineJob("site.build_and_deploy", async (input: { leadId: string; preview?: boolean }, { db }) => {
  const isPreview = !!input.preview;
  const started = Date.now();
  const site = await generateSite(db, input.leadId, { preview: isPreview });

  await db
    .update(clientSites)
    .set({ deployStatus: "deploying", deployError: null, updatedAt: new Date() })
    .where(eq(clientSites.id, site.id));

  try {
    const deployed = await deploySiteHtml({ slug: site.slug, html: site.html, isPreview });
    const [deal] = await db.select().from(deals).where(eq(deals.leadId, input.leadId)).limit(1);

    await db
      .update(clientSites)
      .set({
        deployStatus: isPreview ? "preview" : "live",
        liveUrl: isPreview ? null : deployed.url,
        previewUrl: deployed.previewUrl ?? deployed.url,
        deployError: null,
        dealId: deal?.id ?? null,
        lastDeployedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(clientSites.id, site.id));

    await db.insert(agentActions).values({
      agent: "deploy",
      action: isPreview ? "deploy_preview" : "deploy_live",
      leadId: input.leadId,
      input: { siteId: site.id, slug: site.slug, preview: isPreview },
      output: {
        url: deployed.url,
        previewUrl: deployed.previewUrl,
        deploymentId: deployed.deploymentId,
        projectName: deployed.projectName,
      },
      durationMs: Date.now() - started,
    });

    if (!isPreview) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId));
      if (lead?.email) {
        const client = createEmailClient();
        await client.send({
          to: lead.email,
          from: fromAddress(),
          subject: `Your website is live — ${lead.businessName}`,
          text: `Hi${lead.ownerFirstName ? ` ${lead.ownerFirstName}` : ""},\n\nYour site is live at ${deployed.url}.\n\nReply to this email anytime if you want hours, photos, or copy updated.\n\nBest,\n${env().SENDER_FIRST_NAME}`,
          html: `<p>Your site is live at <a href="${deployed.url}">${deployed.url}</a>.</p><p>Reply anytime for updates.</p><p>Best,<br/>${env().SENDER_FIRST_NAME}</p>`,
        });
      }
    }

    return { siteId: site.id, slug: site.slug, url: deployed.url, previewUrl: deployed.previewUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(clientSites)
      .set({ deployStatus: "failed", deployError: message, updatedAt: new Date() })
      .where(eq(clientSites.id, site.id));
    await db.insert(agentActions).values({
      agent: "deploy",
      action: isPreview ? "deploy_preview" : "deploy_live",
      status: "error",
      leadId: input.leadId,
      input: { siteId: site.id, slug: site.slug, preview: isPreview },
      errorStack: err instanceof Error ? (err.stack ?? message) : message,
      durationMs: Date.now() - started,
    });
    throw err;
  }
});

/** Suspend (unpaid) or restore a lead's live site without changing its URL. */
defineJob("site.suspend", async (input: { leadId: string; suspended: boolean }, { db }) => {
  const [site] = await db
    .select()
    .from(clientSites)
    .where(eq(clientSites.leadId, input.leadId))
    .orderBy(clientSites.isPreview)
    .limit(1);
  if (!site) throw new Error(`No client site for lead ${input.leadId}`);

  if (input.suspended) {
    await suspendSite({ slug: site.slug });
  } else {
    const html = site.config
      ? buildSite(site.template as TemplateName, site.config as Parameters<typeof buildSite>[1])
      : undefined;
    await unsuspendSite({ slug: site.slug, html });
  }

  const deployStatus = input.suspended ? "suspended" : site.isPreview ? "preview" : "live";
  await db
    .update(clientSites)
    .set({ deployStatus, updatedAt: new Date() })
    .where(eq(clientSites.id, site.id));

  await db.insert(agentActions).values({
    agent: "deploy",
    action: input.suspended ? "suspend_site" : "unsuspend_site",
    leadId: input.leadId,
    input: { siteId: site.id, slug: site.slug },
    output: { deployStatus },
  });

  return { siteId: site.id, slug: site.slug, deployStatus };
});

defineJob("billing.dunning_tick", async (_input, { db }) => {
  const { processDunning } = await import("@/lib/dunning");
  return processDunning(db);
});
