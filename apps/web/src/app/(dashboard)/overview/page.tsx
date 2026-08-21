import { getDb } from "@outreach/db";
import { getOverviewKpis, getFunnelStats } from "@/lib/stats";
import { getActivityFeed, getNeedsAttention } from "./data";
import { KpiCards } from "@/components/overview/kpi-cards";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { NeedsAttentionPanel } from "@/components/overview/needs-attention";
import { FunnelBar } from "@/components/overview/funnel-bar";
import { LiveRefresh } from "@/components/overview/live-refresh";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const db = await getDb();
  const [kpis, funnel, feed, attention] = await Promise.all([
    getOverviewKpis(db),
    getFunnelStats(db),
    getActivityFeed(),
    getNeedsAttention(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Overview</h1>
      </div>
      <KpiCards kpis={kpis} />
      <div className="grid grid-cols-1 gap-4 lg:h-[32rem] lg:grid-cols-3">
        <div className="min-h-0 lg:col-span-2">
          <ActivityFeed items={feed} />
        </div>
        <div className="min-h-0">
          <NeedsAttentionPanel data={attention} />
        </div>
      </div>
      <FunnelBar funnel={funnel} />
    </div>
  );
}
