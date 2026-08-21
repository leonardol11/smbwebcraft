"use client";

import { useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enqueueDiscovery } from "@/app/(dashboard)/cities/discovery-actions";

export function DiscoveryButton({
  campaignId,
  slug,
}: {
  campaignId: string;
  slug: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => enqueueDiscovery(campaignId, slug))}
      data-testid={`discover-${campaignId}`}
    >
      <Search className="h-3.5 w-3.5" />
      {pending ? "Discovering…" : "Discover"}
    </Button>
  );
}
