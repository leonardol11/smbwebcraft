"use client";

import { useTransition } from "react";
import { markDealCanceled, rebuildAndDeploySite, setSiteSuspended } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ClientRowActions({
  leadId,
  dealId,
  dealStatus,
  deployStatus,
}: {
  leadId: string;
  dealId: string;
  dealStatus: string;
  deployStatus: string | null;
}) {
  const [pending, start] = useTransition();
  const suspended = deployStatus === "suspended" || dealStatus === "suspended";
  const canceled = dealStatus === "canceled";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || canceled}
        onClick={() => start(() => rebuildAndDeploySite(leadId))}
        data-testid={`rebuild-${leadId}`}
      >
        Rebuild & deploy
      </Button>
      <Button
        size="sm"
        variant={suspended ? "success" : "outline"}
        disabled={pending || canceled}
        onClick={() => start(() => setSiteSuspended(leadId, !suspended))}
        data-testid={`suspend-${leadId}`}
      >
        {suspended ? "Unsuspend site" : "Suspend site"}
      </Button>
      {!canceled && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Mark this deal as cancelled?")) start(() => markDealCanceled(dealId));
          }}
        >
          Mark cancelled
        </Button>
      )}
    </div>
  );
}
