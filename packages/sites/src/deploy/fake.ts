import {
  suspendedPageHtml,
  type DeployResult,
  type DeploySiteParams,
  type SiteDeployer,
  type SuspendParams,
  type UnsuspendParams,
} from "./types.js";

type StoredSite = {
  html: string;
  isPreview: boolean;
  suspended: boolean;
  deployments: number;
};

const store = new Map<string, StoredSite>();

/** Deterministic local URL so dev/test output is predictable offline. */
export function fakeSiteUrl(slug: string): string {
  return `http://${slug}.localhost:3000`;
}

export const fakeDeployer: SiteDeployer = {
  async deploySite({ slug, html, isPreview = false }: DeploySiteParams): Promise<DeployResult> {
    const existing = store.get(slug);
    const deployments = (existing?.deployments ?? 0) + 1;
    store.set(slug, { html, isPreview, suspended: false, deployments });
    return {
      url: fakeSiteUrl(slug),
      previewUrl: fakeSiteUrl(slug),
      deploymentId: `fake-${slug}-${deployments}`,
      projectName: "fake",
    };
  },

  async suspendSite({ slug }: SuspendParams): Promise<void> {
    const existing = store.get(slug);
    if (existing) {
      existing.suspended = true;
      return;
    }
    store.set(slug, { html: "", isPreview: false, suspended: true, deployments: 0 });
  },

  async unsuspendSite({ slug, html }: UnsuspendParams): Promise<void> {
    const existing = store.get(slug);
    if (existing) {
      existing.suspended = false;
      if (html) existing.html = html;
      return;
    }
    if (html) store.set(slug, { html, isPreview: false, suspended: false, deployments: 1 });
  },
};

/** Test/dev helper: what a visitor would see for a fake-deployed slug. */
export function getFakeDeployedHtml(slug: string): string | undefined {
  const site = store.get(slug);
  if (!site) return undefined;
  return site.suspended ? suspendedPageHtml() : site.html;
}

export function isFakeSuspended(slug: string): boolean {
  return store.get(slug)?.suspended ?? false;
}

/** Clears the in-memory fake store (for tests). */
export function resetFakeDeployStore(): void {
  store.clear();
}
