import { createHash } from "node:crypto";
import {
  suspendedPageHtml,
  type DeployResult,
  type DeploySiteParams,
  type SiteDeployer,
  type SuspendParams,
  type UnsuspendParams,
} from "./types.js";

export type CloudflareDeployerOptions = {
  apiToken?: string;
  accountId?: string;
  zoneId?: string;
  domain?: string;
  /** Pages project name prefix; projects are `<prefix>-<slug>`. */
  projectPrefix?: string;
  fetchImpl?: typeof fetch;
};

type Resolved = Required<Omit<CloudflareDeployerOptions, "zoneId">> & { zoneId?: string };

const API = "https://api.cloudflare.com/client/v4";

function resolve(options: CloudflareDeployerOptions): Resolved {
  const apiToken = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const accountId = options.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = options.zoneId ?? process.env.CLOUDFLARE_ZONE_ID;
  const domain = options.domain ?? process.env.CLIENT_SITES_DOMAIN ?? "sites.example.com";
  const projectPrefix =
    options.projectPrefix ?? process.env.CLIENT_SITES_PROJECT_PREFIX ?? "site";
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiToken || !accountId) {
    throw new Error(
      "Cloudflare deploy not configured: set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID",
    );
  }
  return { apiToken, accountId, zoneId, domain, projectPrefix, fetchImpl };
}

/** Pages project names: lowercase, alphanumeric + dashes, max 58 chars. */
export function cloudflareProjectName(slug: string, prefix = "site"): string {
  const raw = `${prefix}-${slug}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return raw.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 58);
}

type CfEnvelope<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: T;
};

async function cf<T>(
  cfg: Resolved,
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ status: number; body: CfEnvelope<T> }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiToken}` };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await cfg.fetchImpl(`${API}${path}`, { ...init, body, headers });
  let parsed: CfEnvelope<T>;
  try {
    parsed = (await res.json()) as CfEnvelope<T>;
  } catch {
    parsed = { success: false, errors: [{ code: res.status, message: res.statusText }] };
  }
  return { status: res.status, body: parsed };
}

function describe(errors?: { code: number; message: string }[]): string {
  return (errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ") || "unknown error";
}

function hasErrorCode(body: CfEnvelope<unknown>, ...codes: number[]): boolean {
  return (body.errors ?? []).some((e) => codes.includes(e.code));
}

async function ensureProject(cfg: Resolved, project: string): Promise<void> {
  const existing = await cf(cfg, `/accounts/${cfg.accountId}/pages/projects/${project}`);
  if (existing.body.success) return;

  const created = await cf(cfg, `/accounts/${cfg.accountId}/pages/projects`, {
    method: "POST",
    json: { name: project, production_branch: "main" },
  });
  // 8000007 = project already exists (race); treat as success.
  if (!created.body.success && created.status !== 409 && !hasErrorCode(created.body, 8000007)) {
    throw new Error(
      `Cloudflare Pages project create failed (${created.status}): ${describe(created.body.errors)}`,
    );
  }
}

type Deployment = { id: string; url?: string };

/**
 * Pages Direct Upload: multipart form with a `manifest` JSON mapping each path
 * to a content hash, plus one file part per hash.
 */
async function uploadDeployment(cfg: Resolved, project: string, html: string): Promise<Deployment> {
  const hash = createHash("sha256").update(html).digest("hex").slice(0, 32);
  const form = new FormData();
  form.append("manifest", JSON.stringify({ "/index.html": hash }));
  form.append("branch", "main");
  form.append(hash, new Blob([html], { type: "text/html" }), "index.html");

  const res = await cf<Deployment>(
    cfg,
    `/accounts/${cfg.accountId}/pages/projects/${project}/deployments`,
    { method: "POST", body: form },
  );
  if (!res.body.success || !res.body.result) {
    throw new Error(`Cloudflare Pages deploy failed (${res.status}): ${describe(res.body.errors)}`);
  }
  return res.body.result;
}

async function ensureCustomDomain(cfg: Resolved, project: string, host: string): Promise<void> {
  const res = await cf(cfg, `/accounts/${cfg.accountId}/pages/projects/${project}/domains`, {
    method: "POST",
    json: { name: host },
  });
  // 8000015 = domain already attached to this project.
  if (!res.body.success && res.status !== 409 && !hasErrorCode(res.body, 8000015)) {
    throw new Error(
      `Cloudflare Pages custom domain failed (${res.status}): ${describe(res.body.errors)}`,
    );
  }
}

async function ensureDnsRecord(cfg: Resolved, host: string, target: string): Promise<void> {
  if (!cfg.zoneId) return;
  const query = `type=CNAME&name=${encodeURIComponent(host)}`;
  const list = await cf<{ id: string; content: string }[]>(
    cfg,
    `/zones/${cfg.zoneId}/dns_records?${query}`,
  );
  const existing = list.body.result?.[0];
  if (existing?.content === target) return;

  const res = existing
    ? await cf(cfg, `/zones/${cfg.zoneId}/dns_records/${existing.id}`, {
        method: "PATCH",
        json: { type: "CNAME", name: host, content: target, proxied: true },
      })
    : await cf(cfg, `/zones/${cfg.zoneId}/dns_records`, {
        method: "POST",
        json: { type: "CNAME", name: host, content: target, proxied: true, ttl: 1 },
      });
  // 81053/81057 = identical record already exists.
  if (!res.body.success && !hasErrorCode(res.body, 81053, 81057)) {
    throw new Error(`Cloudflare DNS record failed (${res.status}): ${describe(res.body.errors)}`);
  }
}

/**
 * Live deployer: one Cloudflare Pages project per site (`<prefix>-<slug>`) so
 * suspend/unsuspend only touches that site. Live sites get a custom domain
 * `<slug>.<CLIENT_SITES_DOMAIN>` plus a proxied CNAME; previews stay on *.pages.dev.
 */
export function createCloudflareDeployer(options: CloudflareDeployerOptions = {}): SiteDeployer {
  const cfg = resolve(options);

  async function publish(slug: string, html: string, isPreview: boolean): Promise<DeployResult> {
    const project = cloudflareProjectName(slug, cfg.projectPrefix);
    await ensureProject(cfg, project);
    const deployment = await uploadDeployment(cfg, project, html);
    const pagesUrl = `https://${project}.pages.dev`;
    const previewUrl = deployment.url ?? pagesUrl;

    if (isPreview) {
      return { url: pagesUrl, previewUrl, deploymentId: deployment.id, projectName: project };
    }

    const host = `${slug}.${cfg.domain}`;
    await ensureCustomDomain(cfg, project, host);
    await ensureDnsRecord(cfg, host, `${project}.pages.dev`);
    return { url: `https://${host}`, previewUrl, deploymentId: deployment.id, projectName: project };
  }

  return {
    deploySite({ slug, html, isPreview = false }: DeploySiteParams) {
      return publish(slug, html, isPreview);
    },

    async suspendSite({ slug }: SuspendParams): Promise<void> {
      const project = cloudflareProjectName(slug, cfg.projectPrefix);
      await ensureProject(cfg, project);
      await uploadDeployment(cfg, project, suspendedPageHtml());
    },

    async unsuspendSite({ slug, html }: UnsuspendParams): Promise<void> {
      if (!html) {
        throw new Error(`unsuspendSite(${slug}): html is required to restore a live site`);
      }
      const project = cloudflareProjectName(slug, cfg.projectPrefix);
      await ensureProject(cfg, project);
      await uploadDeployment(cfg, project, html);
    },
  };
}
