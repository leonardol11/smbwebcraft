import { Suspense } from "react";
import { getDb, getSettings } from "@outreach/db";
import { updateNumericSetting } from "@/app/actions";
import { DnsHealthPanel } from "@/components/settings/dns-health-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { KillSwitch } from "@/components/settings/kill-switch";
import { SampleJobButtons } from "@/components/settings/sample-job-buttons";
import { SuppressionList } from "@/components/settings/suppression-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const NUMERIC_SETTINGS: { key: string; label: string; hint: string }[] = [
  { key: "global_daily_send_cap", label: "Global daily send cap", hint: "emails/day" },
  {
    key: "max_agent_replies_per_lead_per_day",
    label: "Max agent replies per lead per day",
    hint: "emails",
  },
  { key: "setup_price_cents", label: "Setup price", hint: "cents ($100 = 10000)" },
  { key: "monthly_price_cents", label: "Monthly price", hint: "cents ($25 = 2500)" },
  { key: "reply_delay_seconds", label: "Reply agent delay", hint: "seconds before auto-reply" },
  {
    key: "suspend_after_days_past_due",
    label: "Suspend site after",
    hint: "days past due",
  },
];

export default async function SettingsPage() {
  const db = await getDb();
  const s = await getSettings(db);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-lg font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Kill switches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <KillSwitch
            flag="sending_paused"
            label="Outbound sending"
            paused={s.sending_paused}
            description="When paused, no cold emails or sequence steps are sent."
          />
          <KillSwitch
            flag="reply_agent_paused"
            label="Reply agent auto-send"
            paused={s.reply_agent_paused}
            description="When paused, the agent queues drafts instead of sending replies."
          />
          <KillSwitch
            flag="discovery_paused"
            label="Lead discovery"
            paused={s.discovery_paused}
            description="When paused, no Places API discovery jobs run."
          />
          <p className="text-xs text-muted-foreground">
            Green toggle = running. Red toggle = paused.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits & pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NUMERIC_SETTINGS.map((n) => (
            <form key={n.key} action={updateNumericSetting} className="flex items-end gap-2">
              <div className="flex-1">
                <Label>
                  {n.label} <span className="opacity-60">({n.hint})</span>
                </Label>
                <Input
                  name="value"
                  type="number"
                  defaultValue={String(s[n.key as keyof typeof s])}
                  className="mt-1"
                />
              </div>
              <input type="hidden" name="key" value={n.key} />
              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sending domain health</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense
            fallback={<p className="text-xs text-muted-foreground">Checking DNS records…</p>}
          >
            <DnsHealthPanel />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppression list</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-xs text-muted-foreground">Loading…</p>}>
            <SuppressionList />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <IntegrationsPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Trigger test jobs to verify queue plumbing; results appear in the Agent Log.
          </p>
          <SampleJobButtons />
        </CardContent>
      </Card>
    </div>
  );
}
