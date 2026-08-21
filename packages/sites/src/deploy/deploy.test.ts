import { beforeEach, describe, expect, it } from "vitest";
import {
  cloudflareProjectName,
  createCloudflareDeployer,
  deploySiteHtml,
  getFakeDeployedHtml,
  isFakeSuspended,
  resetFakeDeployStore,
  suspendSite,
  unsuspendSite,
} from "../index.js";

describe("fake deployer", () => {
  beforeEach(() => {
    resetFakeDeployStore();
    process.env.PROVIDER_MODE = "fake";
  });

  it("stores html and returns a deterministic local url", async () => {
    const result = await deploySiteHtml({ slug: "marias-taqueria-austin", html: "<h1>Hi</h1>" });
    expect(result.url).toBe("http://marias-taqueria-austin.localhost:3000");
    expect(result.projectName).toBe("fake");
    expect(result.deploymentId).toContain("marias-taqueria-austin");
    expect(getFakeDeployedHtml("marias-taqueria-austin")).toBe("<h1>Hi</h1>");
  });

  it("suspend flips the flag and serves the unavailable page; unsuspend restores", async () => {
    await deploySiteHtml({ slug: "joes-plumbing-austin", html: "<h1>Joe</h1>" });
    await suspendSite("joes-plumbing-austin");
    expect(isFakeSuspended("joes-plumbing-austin")).toBe(true);
    expect(getFakeDeployedHtml("joes-plumbing-austin")).toContain("temporarily unavailable");

    await unsuspendSite({ slug: "joes-plumbing-austin" });
    expect(isFakeSuspended("joes-plumbing-austin")).toBe(false);
    expect(getFakeDeployedHtml("joes-plumbing-austin")).toBe("<h1>Joe</h1>");

    await suspendSite({ slug: "joes-plumbing-austin", suspended: true });
    expect(isFakeSuspended("joes-plumbing-austin")).toBe(true);
    await suspendSite({ slug: "joes-plumbing-austin", suspended: false });
    expect(isFakeSuspended("joes-plumbing-austin")).toBe(false);
  });
});

describe("cloudflare deployer (mocked fetch)", () => {
  it("creates a per-site project, direct-uploads index.html, attaches domain + CNAME", async () => {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      let body: unknown;
      if (init?.body instanceof FormData) {
        const manifest = init.body.get("manifest");
        const hash = Object.values(JSON.parse(String(manifest)) as Record<string, string>)[0]!;
        const file = init.body.get(hash) as Blob;
        body = { manifest, fileText: await file.text() };
      } else if (typeof init?.body === "string") {
        body = JSON.parse(init.body);
      }
      calls.push({ method, url, body });

      const json = (result: unknown, success = true, status = 200) =>
        new Response(JSON.stringify({ success, result, errors: [] }), { status });

      if (method === "GET" && /\/pages\/projects\/site-[^/]+$/.test(url)) {
        return json(null, false, 404);
      }
      if (method === "GET" && url.includes("/dns_records?")) return json([]);
      if (url.endsWith("/deployments")) return json({ id: "dep_123", url: "https://abc.site-x.pages.dev" });
      return json({ id: "ok" });
    };

    const deployer = createCloudflareDeployer({
      apiToken: "t",
      accountId: "acct",
      zoneId: "zone",
      domain: "sites.example.com",
      fetchImpl,
    });
    const result = await deployer.deploySite({ slug: "marias-taqueria-austin", html: "<p>hi</p>" });

    expect(result).toEqual({
      url: "https://marias-taqueria-austin.sites.example.com",
      previewUrl: "https://abc.site-x.pages.dev",
      deploymentId: "dep_123",
      projectName: "site-marias-taqueria-austin",
    });

    const urls = calls.map((c) => `${c.method} ${c.url.replace("https://api.cloudflare.com/client/v4", "")}`);
    expect(urls).toEqual([
      "GET /accounts/acct/pages/projects/site-marias-taqueria-austin",
      "POST /accounts/acct/pages/projects",
      "POST /accounts/acct/pages/projects/site-marias-taqueria-austin/deployments",
      "POST /accounts/acct/pages/projects/site-marias-taqueria-austin/domains",
      "GET /zones/zone/dns_records?type=CNAME&name=marias-taqueria-austin.sites.example.com",
      "POST /zones/zone/dns_records",
    ]);
    expect(calls[2]!.body).toMatchObject({ fileText: "<p>hi</p>" });
    expect(calls[5]!.body).toMatchObject({
      type: "CNAME",
      name: "marias-taqueria-austin.sites.example.com",
      content: "site-marias-taqueria-austin.pages.dev",
      proxied: true,
    });
  });

  it("previews skip custom domain + DNS and suspend redeploys a placeholder", async () => {
    const uploads: string[] = [];
    const paths: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      paths.push(`${init?.method ?? "GET"} ${String(input)}`);
      if (init?.body instanceof FormData) {
        const hash = Object.values(JSON.parse(String(init.body.get("manifest"))) as Record<string, string>)[0]!;
        uploads.push(await (init.body.get(hash) as Blob).text());
      }
      const isDeploy = String(input).endsWith("/deployments");
      return new Response(
        JSON.stringify({ success: true, result: isDeploy ? { id: "d1" } : { name: "x" } }),
      );
    };
    const deployer = createCloudflareDeployer({ apiToken: "t", accountId: "a", fetchImpl });

    const preview = await deployer.deploySite({ slug: "preview-x", html: "<p>p</p>", isPreview: true });
    expect(preview.url).toBe("https://site-preview-x.pages.dev");
    expect(paths.some((p) => p.includes("/domains") || p.includes("dns_records"))).toBe(false);

    await deployer.suspendSite({ slug: "preview-x" });
    expect(uploads.at(-1)).toContain("temporarily unavailable");
    await deployer.unsuspendSite({ slug: "preview-x", html: "<p>back</p>" });
    expect(uploads.at(-1)).toBe("<p>back</p>");
  });

  it("sanitizes project names", () => {
    expect(cloudflareProjectName("Joe's_Plumbing")).toBe("site-joe-s-plumbing");
  });
});
