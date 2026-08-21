"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { bulkSuppressLeads } from "@/app/(dashboard)/cities/lead-actions";

export function BulkSuppressButton({
  leadIds,
  slug,
}: {
  leadIds: string[];
  slug: string;
}) {
  const [pending, startTransition] = useTransition();
  const disabled = pending || leadIds.length === 0;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => startTransition(() => bulkSuppressLeads(leadIds, slug))}
    >
      {pending ? "Suppressing…" : `Suppress selected (${leadIds.length})`}
    </Button>
  );
}
