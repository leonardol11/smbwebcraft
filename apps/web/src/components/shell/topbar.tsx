import { getDb, getSettings } from "@outreach/db";
import { sendsToday } from "@/lib/stats";
import { HealthPill } from "./health-pill";
import { PauseAllButton } from "./pause-all-button";

export async function Topbar() {
  const db = await getDb();
  const [settings, sent] = await Promise.all([getSettings(db), sendsToday(db)]);
  const allPaused =
    settings.sending_paused && settings.reply_agent_paused && settings.discovery_paused;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <HealthPill />
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">
          Sends today:{" "}
          <span className="font-medium text-foreground">
            {sent} / {settings.global_daily_send_cap}
          </span>
        </span>
        <PauseAllButton allPaused={allPaused} />
      </div>
    </header>
  );
}
