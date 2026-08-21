"use client";

import { useTransition } from "react";
import { OctagonPause, Play } from "lucide-react";
import { togglePauseAll } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function PauseAllButton({ allPaused }: { allPaused: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={allPaused ? "success" : "destructive"}
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => togglePauseAll())}
    >
      {allPaused ? <Play className="h-3.5 w-3.5" /> : <OctagonPause className="h-3.5 w-3.5" />}
      {allPaused ? "RESUME ALL" : "PAUSE ALL"}
    </Button>
  );
}
