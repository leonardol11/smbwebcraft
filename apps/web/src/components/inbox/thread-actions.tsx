"use client";

import { useTransition } from "react";
import {
  closeThread,
  markLeadStatus,
  reopenThread,
  toggleThreadTakeover,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

export function ThreadActions({
  threadId,
  leadId,
  agentPaused,
  status,
  leadStatus,
}: {
  threadId: string;
  leadId: string | null;
  agentPaused: boolean;
  status: "active" | "closed" | "unmatched";
  leadStatus: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={agentPaused ? "outline" : "default"}
        disabled={pending}
        onClick={() => start(() => toggleThreadTakeover(threadId))}
        data-testid="takeover-toggle"
      >
        {agentPaused ? "Hand back to agent" : "Take over"}
      </Button>
      {leadId && (
        <>
          <Button
            size="sm"
            variant="success"
            disabled={pending || leadStatus === "interested"}
            onClick={() => start(() => markLeadStatus(leadId, "interested"))}
          >
            Interested
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || leadStatus === "not_interested"}
            onClick={() => start(() => markLeadStatus(leadId, "not_interested"))}
          >
            Not interested
          </Button>
        </>
      )}
      {status === "closed" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => reopenThread(threadId))}>
          Reopen
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => closeThread(threadId))}>
          Close thread
        </Button>
      )}
    </div>
  );
}
