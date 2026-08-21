import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import { checkDomainDnsRecords, checkSendingDomainDns } from "./dns";
import type { DnsResolver } from "./types";

beforeEach(() => {
  resetEnvForTests();
  process.env.PROVIDER_MODE = "fake";
  loadEnv(process.env);
});

describe("checkSendingDomainDns", () => {
  it("returns all green in fake mode", async () => {
    const result = await checkSendingDomainDns();
    expect(result.allOk).toBe(true);
    expect(result.spf.ok).toBe(true);
    expect(result.dkim.ok).toBe(true);
    expect(result.dmarc.ok).toBe(true);
    expect(result.mx.ok).toBe(true);
  });
});

function healthyResolver(domain: string): DnsResolver {
  return {
    async resolveTxt(name) {
      if (name === domain) return [["v=spf1 include:amazonses.com ~all"]];
      if (name === `_dmarc.${domain}`) return [["v=DMARC1; p=none;"]];
      if (name === `resend._domainkey.${domain}`) return [["v=DKIM1; k=rsa; p=MIGfMA0G"]];
      return [];
    },
    async resolveCname() {
      throw new Error("no cname");
    },
    async resolveMx(name) {
      if (name === domain) return [{ priority: 10, exchange: "inbound.resend.com" }];
      return [];
    },
  };
}

const emptyResolver: DnsResolver = {
  async resolveTxt() {
    return [];
  },
  async resolveCname() {
    throw new Error("no cname");
  },
  async resolveMx() {
    throw new Error("no mx");
  },
};

describe("checkDomainDnsRecords (live-path logic)", () => {
  const domain = "mail.example.com";

  it("reports all green when SPF, DKIM, DMARC, and MX resolve", async () => {
    const result = await checkDomainDnsRecords(domain, healthyResolver(domain));
    expect(result.allOk).toBe(true);
    expect(result.spf).toEqual({ ok: true, detail: "v=spf1 include:amazonses.com ~all" });
    expect(result.dkim.ok).toBe(true);
    expect(result.dkim.detail).toContain("resend._domainkey");
    expect(result.dmarc).toEqual({ ok: true, detail: "v=DMARC1; p=none;" });
    expect(result.mx).toEqual({ ok: true, detail: "10 inbound.resend.com" });
  });

  it("accepts a DKIM CNAME when no TXT record exists", async () => {
    const resolver: DnsResolver = {
      ...emptyResolver,
      async resolveCname(name) {
        if (name === `resend._domainkey.${domain}`) return ["dkim.resend.com"];
        throw new Error("no cname");
      },
    };
    const result = await checkDomainDnsRecords(domain, resolver);
    expect(result.dkim.ok).toBe(true);
    expect(result.dkim.detail).toContain("CNAME");
  });

  it("reports every record red when nothing resolves", async () => {
    const result = await checkDomainDnsRecords(domain, emptyResolver);
    expect(result.allOk).toBe(false);
    expect(result.spf.ok).toBe(false);
    expect(result.dkim.ok).toBe(false);
    expect(result.dmarc.ok).toBe(false);
    expect(result.mx.ok).toBe(false);
  });

  it("marks allOk false when only one record is missing", async () => {
    const resolver = healthyResolver(domain);
    const partial: DnsResolver = {
      ...resolver,
      async resolveTxt(name) {
        if (name === `_dmarc.${domain}`) return [];
        return resolver.resolveTxt(name);
      },
    };
    const result = await checkDomainDnsRecords(domain, partial);
    expect(result.allOk).toBe(false);
    expect(result.dmarc.ok).toBe(false);
    expect(result.spf.ok).toBe(true);
    expect(result.mx.ok).toBe(true);
  });
});
