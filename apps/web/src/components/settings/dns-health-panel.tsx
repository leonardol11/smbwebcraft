import { checkSendingDomainDns } from "@outreach/email";
import { env } from "@outreach/env";
import { cn } from "@/lib/utils";

const RECORD_LABELS = [
  { key: "spf", label: "SPF" },
  { key: "dkim", label: "DKIM" },
  { key: "dmarc", label: "DMARC" },
  { key: "mx", label: "MX" },
] as const;

/** Server component: resolves SPF/DKIM/DMARC/MX for the sending domain. */
export async function DnsHealthPanel() {
  const result = await checkSendingDomainDns();
  const fakeMode = env().PROVIDER_MODE === "fake";

  return (
    <div className="flex flex-col gap-2" data-testid="dns-health-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          Sending domain: <span className="font-mono">{result.domain}</span>
          {fakeMode && <span className="ml-2 text-xs text-muted-foreground">(fake mode)</span>}
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            result.allOk ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
          )}
          data-testid="dns-overall-status"
        >
          {result.allOk ? "All records healthy" : "Action needed"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {RECORD_LABELS.map(({ key, label }) => {
          const record = result[key];
          return (
            <div
              key={key}
              className="flex items-start gap-2 rounded-lg border p-3"
              data-testid={`dns-record-${key}`}
            >
              <span
                className={cn(
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                  record.ok ? "bg-success" : "bg-destructive",
                )}
                aria-label={record.ok ? `${label} OK` : `${label} failing`}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium">{label}</div>
                <div className="truncate text-xs text-muted-foreground" title={record.detail}>
                  {record.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Checked on page load. Reload to re-run the lookup.
      </p>
    </div>
  );
}
