"use client";

import { useTransition } from "react";
import { Pause, Play } from "lucide-react";
import { setCampaignStatus } from "@/app/(dashboard)/cities/actions";
import { Button } from "@/components/ui/button";

export function CampaignStatusButton({
  campaignId,
  status,
  slug,
}: {
  campaignId: string;
  status: "draft" | "running" | "paused";
  slug: string;
}) {
  const [pending, startTransition] = useTransition();
  const next = status === "running" ? "paused" : "running";
  return (
    <Button
      size="sm"
      variant={status === "running" ? "outline" : "success"}
      disabled={pending}
      onClick={() => startTransition(() => setCampaignStatus(campaignId, next, slug))}
      data-testid={`campaign-toggle-${campaignId}`}
    >
      {status === "running" ? (
        <>
          <Pause className="h-3.5 w-3.5" /> Pause
        </>
      ) : (
        <>
          <Play className="h-3.5 w-3.5" /> Run
        </>
      )}
    </Button>
  );
}
