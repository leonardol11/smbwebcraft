"use client";

import { useTransition } from "react";
import { toggleSettingFlag } from "@/app/actions";
import { cn } from "@/lib/utils";

type Flag = "sending_paused" | "reply_agent_paused" | "discovery_paused";

export function KillSwitch({
  flag,
  label,
  paused,
  description,
}: {
  flag: Flag;
  label: string;
  paused: boolean;
  description: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        disabled={pending}
        onClick={() => startTransition(() => toggleSettingFlag(flag))}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          paused ? "bg-destructive" : "bg-success",
          pending && "opacity-50",
        )}
        aria-label={`Toggle ${label}`}
        data-testid={`kill-switch-${flag}`}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            paused ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
