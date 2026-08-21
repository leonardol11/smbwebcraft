import { env } from "@outreach/env";
import { Badge } from "@/components/ui/badge";

type EnvVar = { name: string; required?: boolean };
type Integration = {
  name: string;
  purpose: string;
  vars: EnvVar[];
  where: { label: string; href: string }[];
  webhooks?: { label: string; path: string }[];
};

const INTEGRATIONS: Integration[] = [
  {
    name: "Google Places",
    purpose: "Lead discovery",
    vars: [{ name: "GOOGLE_PLACES_API_KEY", required: true }, { name: "GOOGLE_MAPS_EMBED_KEY" }],
    where: [
      { label: "Google Cloud console → APIs & Services → Credentials", href: "https://console.cloud.google.com/apis/credentials" },
    ],
  },
  {
    name: "Resend",
    purpose: "Outbound email, delivery events, inbound replies",
    vars: [
      { name: "RESEND_API_KEY", required: true },
      { name: "RESEND_WEBHOOK_SECRET", required: true },
      { name: "SENDING_DOMAIN", required: true },
    ],
    where: [
      { label: "API keys", href: "https://resend.com/api-keys" },
      { label: "Webhooks (signing secret)", href: "https://resend.com/webhooks" },
      { label: "Domains (SPF/DKIM/DMARC DNS)", href: "https://resend.com/domains" },
    ],
    webhooks: [
      { label: "Inbound email webhook (email.received)", path: "/api/webhooks/email" },
      { label: "Delivery events webhook (delivered/bounced/complained/opened)", path: "/api/webhooks/resend-events" },
    ],
  },
  {
    name: "Hunter.io",
    purpose: "Owner email enrichment",
    vars: [{ name: "HUNTER_API_KEY", required: true }],
    where: [{ label: "Hunter → API", href: "https://hunter.io/api-keys" }],
  },
  {
    name: "Anthropic",
    purpose: "Reply agent + copywriting",
    vars: [{ name: "ANTHROPIC_API_KEY", required: true }],
    where: [{ label: "Anthropic console → API keys", href: "https://console.anthropic.com/settings/keys" }],
  },
  {
    name: "Stripe",
    purpose: "Payments, dunning, customer portal",
    vars: [
      { name: "STRIPE_SECRET_KEY", required: true },
      { name: "STRIPE_WEBHOOK_SECRET", required: true },
      { name: "STRIPE_PAYMENT_LINK_URL", required: true },
      { name: "STRIPE_CUSTOMER_PORTAL_URL" },
    ],
    where: [
      { label: "API keys", href: "https://dashboard.stripe.com/apikeys" },
      { label: "Payment Links", href: "https://dashboard.stripe.com/payment-links" },
      { label: "Webhooks", href: "https://dashboard.stripe.com/webhooks" },
      { label: "Customer portal settings", href: "https://dashboard.stripe.com/settings/billing/portal" },
    ],
    webhooks: [{ label: "Stripe webhook endpoint", path: "/api/webhooks/stripe" }],
  },
  {
    name: "Cloudflare",
    purpose: "Client site deploys + DNS",
    vars: [
      { name: "CLOUDFLARE_API_TOKEN", required: true },
      { name: "CLOUDFLARE_ACCOUNT_ID", required: true },
      { name: "CLOUDFLARE_ZONE_ID", required: true },
      { name: "CLIENT_SITES_DOMAIN", required: true },
      { name: "CLIENT_SITES_PROJECT" },
    ],
    where: [
      { label: "API tokens", href: "https://dash.cloudflare.com/profile/api-tokens" },
      { label: "Account ID + Zone ID (domain Overview page, right sidebar)", href: "https://dash.cloudflare.com/" },
    ],
  },
  {
    name: "Inngest",
    purpose: "Durable job queue (live mode only)",
    vars: [{ name: "INNGEST_EVENT_KEY" }, { name: "INNGEST_SIGNING_KEY" }],
    where: [{ label: "Inngest dashboard → Apps", href: "https://app.inngest.com/" }],
    webhooks: [{ label: "Inngest serve endpoint", path: "/api/inngest" }],
  },
  {
    name: "Alerts",
    purpose: "Red-state health emails",
    vars: [{ name: "ALERT_EMAIL" }],
    where: [],
  },
];

/** Reads a var from the validated env first, then raw process.env (for keys other agents may add). */
function readVar(name: string): string | undefined {
  const e = env() as unknown as Record<string, unknown>;
  const v = e[name];
  if (typeof v === "string" && v.length > 0) return v;
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : undefined;
}

function mask(name: string, value: string): string {
  const isSecret = /KEY|SECRET|TOKEN|PASSWORD/.test(name);
  if (!isSecret) return value.length > 48 ? `${value.slice(0, 45)}…` : value;
  return `set (…${value.slice(-4)})`;
}

/** Server component listing every external integration, its env vars, and webhook URLs. */
export function IntegrationsPanel() {
  const e = env();
  const live = e.PROVIDER_MODE === "live";
  const appUrl = e.APP_URL.replace(/\/$/, "");

  return (
    <div className="flex flex-col gap-4" data-testid="integrations-panel">
      <div
        className={`flex items-center justify-between rounded-lg border p-3 ${
          live ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"
        }`}
      >
        <div>
          <div className="text-sm font-medium">
            PROVIDER_MODE: <span className="font-mono">{e.PROVIDER_MODE}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {live
              ? "Live: real providers are called and real emails are sent."
              : "Nothing goes live until PROVIDER_MODE=live. All providers are offline fakes; keys below are optional."}
          </div>
        </div>
        <Badge variant={live ? "success" : "warning"}>{live ? "LIVE" : "FAKE"}</Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Integration</th>
              <th className="py-2 pr-3 font-medium">Env var</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Where to get it</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map((integration) =>
              integration.vars.map((v, i) => {
                const value = readVar(v.name);
                const status = value
                  ? { label: mask(v.name, value), variant: "success" as const }
                  : v.required && live
                    ? { label: "missing", variant: "destructive" as const }
                    : { label: v.required ? "missing (needed for live)" : "not set (optional)", variant: "muted" as const };
                return (
                  <tr key={`${integration.name}-${v.name}`} className="border-b align-top last:border-b-0">
                    {i === 0 && (
                      <td className="py-2 pr-3" rowSpan={integration.vars.length}>
                        <div className="font-medium">{integration.name}</div>
                        <div className="text-muted-foreground">{integration.purpose}</div>
                        {integration.webhooks && integration.webhooks.length > 0 && (
                          <ul className="mt-1 flex flex-col gap-0.5">
                            {integration.webhooks.map((w) => (
                              <li key={w.path}>
                                <span className="text-muted-foreground">{w.label}:</span>{" "}
                                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                                  {appUrl}
                                  {w.path}
                                </code>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 font-mono" data-testid={`env-${v.name}`}>
                      {v.name}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </td>
                    {i === 0 && (
                      <td className="py-2" rowSpan={integration.vars.length}>
                        {integration.where.length === 0 ? (
                          <span className="text-muted-foreground">Any mailbox you read.</span>
                        ) : (
                          <ul className="flex flex-col gap-0.5">
                            {integration.where.map((w) => (
                              <li key={w.href + w.label}>
                                <a
                                  href={w.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline underline-offset-2"
                                >
                                  {w.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Secret values are never shown; only the last 4 characters. Set vars in <code>.env</code> (see{" "}
        <code>.env.example</code>) and restart the app. Webhook URLs are derived from APP_URL.
      </p>
    </div>
  );
}
