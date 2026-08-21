export type DeploySiteParams = {
  slug: string;
  html: string;
  isPreview?: boolean;
};

export type DeployResult = {
  /** Canonical URL: custom domain for live sites, the *.pages.dev host for previews. */
  url: string;
  /** Provider preview URL (Cloudflare *.pages.dev deployment URL) when available. */
  previewUrl?: string;
  /** Provider deployment id (Cloudflare Pages deployment id, or "fake"). */
  deploymentId: string;
  /** Provider project name (Cloudflare Pages project, or "fake"). */
  projectName: string;
};

export type SuspendParams = {
  slug: string;
};

export type UnsuspendParams = {
  slug: string;
  /**
   * The site's HTML to restore. Required for live deploys (the provider has no
   * "un-suspend" primitive; we redeploy the real page). Ignored by the fake.
   */
  html?: string;
};

export interface SiteDeployer {
  deploySite(params: DeploySiteParams): Promise<DeployResult>;
  suspendSite(params: SuspendParams): Promise<void>;
  unsuspendSite(params: UnsuspendParams): Promise<void>;
}

/** Static page served while a client site is suspended (e.g. unpaid invoice). */
export function suspendedPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Site temporarily unavailable</title>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    main { text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <main>
    <h1>This site is temporarily unavailable</h1>
    <p>Please check back soon.</p>
  </main>
</body>
</html>`;
}
