import { promises as nodeDns } from "node:dns";
import { env } from "@outreach/env";
import type { DnsHealthResult, DnsRecordStatus, DnsResolver } from "./types";

const defaultResolver: DnsResolver = {
  resolveTxt: (name) => nodeDns.resolveTxt(name),
  resolveCname: (name) => nodeDns.resolveCname(name),
  resolveMx: (name) => nodeDns.resolveMx(name),
};

function ok(detail: string): DnsRecordStatus {
  return { ok: true, detail };
}

function fail(detail: string): DnsRecordStatus {
  return { ok: false, detail };
}

function fakeGreen(domain: string): DnsHealthResult {
  const green = ok("OK (fake mode)");
  return {
    domain,
    spf: green,
    dkim: green,
    dmarc: green,
    mx: green,
    allOk: true,
  };
}

async function resolveTxtRecords(resolver: DnsResolver, name: string): Promise<string[]> {
  try {
    const records = await resolver.resolveTxt(name);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function checkSpf(resolver: DnsResolver, domain: string): Promise<DnsRecordStatus> {
  const records = await resolveTxtRecords(resolver, domain);
  const spf = records.find((r) => r.toLowerCase().startsWith("v=spf1"));
  return spf ? ok(spf) : fail("No SPF TXT record found");
}

async function checkDmarc(resolver: DnsResolver, domain: string): Promise<DnsRecordStatus> {
  const records = await resolveTxtRecords(resolver, `_dmarc.${domain}`);
  const dmarc = records.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  return dmarc ? ok(dmarc) : fail("No DMARC record at _dmarc subdomain");
}

async function checkDkim(resolver: DnsResolver, domain: string): Promise<DnsRecordStatus> {
  const selectors = [`resend._domainkey.${domain}`, `default._domainkey.${domain}`];
  for (const name of selectors) {
    const txt = await resolveTxtRecords(resolver, name);
    if (txt.some((r) => r.includes("v=DKIM1") || r.includes("p="))) {
      return ok(`DKIM TXT at ${name}`);
    }
    try {
      await resolver.resolveCname(name);
      return ok(`DKIM CNAME at ${name}`);
    } catch {
      // try next selector
    }
  }
  return fail("No DKIM record found (checked resend._domainkey and default._domainkey)");
}

async function checkMx(resolver: DnsResolver, domain: string): Promise<DnsRecordStatus> {
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length === 0) return fail("No MX records");
    const detail = mx
      .sort((a, b) => a.priority - b.priority)
      .map((r) => `${r.priority} ${r.exchange}`)
      .join(", ");
    return ok(detail);
  } catch {
    return fail("MX lookup failed");
  }
}

/** Perform real SPF, DKIM, DMARC, and MX lookups against the given resolver. */
export async function checkDomainDnsRecords(
  domain: string,
  resolver: DnsResolver = defaultResolver,
): Promise<DnsHealthResult> {
  const [spf, dkim, dmarc, mx] = await Promise.all([
    checkSpf(resolver, domain),
    checkDkim(resolver, domain),
    checkDmarc(resolver, domain),
    checkMx(resolver, domain),
  ]);

  return {
    domain,
    spf,
    dkim,
    dmarc,
    mx,
    allOk: spf.ok && dkim.ok && dmarc.ok && mx.ok,
  };
}

/**
 * Check SPF, DKIM, DMARC, and MX for the configured sending domain.
 * In fake provider mode this reports all green without touching the network.
 */
export async function checkSendingDomainDns(
  domain: string = env().SENDING_DOMAIN,
  resolver?: DnsResolver,
): Promise<DnsHealthResult> {
  if (env().PROVIDER_MODE === "fake") {
    return fakeGreen(domain);
  }
  return checkDomainDnsRecords(domain, resolver);
}
