"use client";

import { useTransition } from "react";
import { triggerSampleJob } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SampleJobButtons() {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => triggerSampleJob(false))}
      >
        Run sample job
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => triggerSampleJob(true))}
      >
        Run failing job
      </Button>
    </div>
  );
}
