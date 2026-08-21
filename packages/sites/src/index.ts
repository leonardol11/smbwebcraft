import { siteConfigSchema, type SiteConfig } from "./schema.js";
import { cloudflareProjectName, createCloudflareDeployer } from "./deploy/cloudflare.js";
import {
  fakeDeployer,
  fakeSiteUrl,
  getFakeDeployedHtml,
  isFakeSuspended,
  resetFakeDeployStore,
} from "./deploy/fake.js";
import {
  suspendedPageHtml,
  type DeployResult,
  type DeploySiteParams,
  type SiteDeployer,
} from "./deploy/types.js";
import { TEMPLATE_BUILDERS } from "./templates/index.js";
import { TEMPLATES, type TemplateName } from "./templates/names.js";

export { siteConfigSchema, type SiteConfig };
export { TEMPLATES, type TemplateName };
export {
  cloudflareProjectName,
  createCloudflareDeployer,
  fakeDeployer,
  fakeSiteUrl,
  getFakeDeployedHtml,
  isFakeSuspended,
  resetFakeDeployStore,
  suspendedPageHtml,
};
export type {
  DeployResult,
  DeploySiteParams,
  SiteDeployer,
  SuspendParams,
  UnsuspendParams,
} from "./deploy/types.js";

export function buildSite(template: TemplateName, config: SiteConfig): string {
  const parsed = siteConfigSchema.parse(config);
  const builder = TEMPLATE_BUILDERS[template];
  return builder.buildHtml(parsed);
}

/** Fake in dev/test (offline), Cloudflare Pages when PROVIDER_MODE=live. */
export function getSiteDeployer(): SiteDeployer {
  return process.env.PROVIDER_MODE === "live" ? createCloudflareDeployer() : fakeDeployer;
}

export async function deploySiteHtml(params: DeploySiteParams): Promise<DeployResult> {
  return getSiteDeployer().deploySite(params);
}

type SuspendInput = string | { slug: string; suspended?: boolean; html?: string };

/**
 * Replace a live site with a "temporarily unavailable" page, keeping its URL.
 * Accepts a bare slug or `{ slug, suspended }`; `suspended: false` un-suspends
 * (pass `html` to restore the real page in live mode).
 */
export async function suspendSite(input: SuspendInput): Promise<void> {
  const params = typeof input === "string" ? { slug: input } : input;
  if (params.suspended === false) {
    return unsuspendSite({ slug: params.slug, html: params.html });
  }
  return getSiteDeployer().suspendSite({ slug: params.slug });
}

export async function unsuspendSite(input: string | { slug: string; html?: string }): Promise<void> {
  const params = typeof input === "string" ? { slug: input } : input;
  return getSiteDeployer().unsuspendSite(params);
}
