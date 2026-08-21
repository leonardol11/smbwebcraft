"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Status = "green" | "amber" | "red";
type Check = { name: string; status: Status; detail: string };
type Health = { status: Status; reasons: string[]; checks?: Check[] };

const POLL_MS = 60_000;

const LABEL: Record<Status, string> = { green: "Healthy", amber: "Degraded", red: "Broken" };

export function HealthPill() {
  const [health, setHealth] = useState<Health>({ status: "green", reasons: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok && active) setHealth(await res.json());
      } catch {}
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const status = health.status;
  const summary = status === "green" ? LABEL.green : (health.reasons[0] ?? LABEL[status]);
  const checks = health.checks ?? [];
  const nonGreen = checks.filter((c) => c.status !== "green");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={health.reasons.join("\n") || "All systems healthy"}
        aria-expanded={open}
        data-testid="health-pill"
        data-status={status}
        className={cn(
          "inline-flex max-w-[22rem] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
          status === "green" && "border-success/40 bg-success/10 text-success",
          status === "amber" && "border-warning/40 bg-warning/10 text-warning",
          status === "red" && "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "green" && "bg-success",
            status === "amber" && "bg-warning",
            status === "red" && "bg-destructive animate-pulse",
          )}
        />
        <span className="truncate">{summary}</span>
        {health.reasons.length > 1 && (
          <span className="shrink-0 opacity-70">+{health.reasons.length - 1}</span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          data-testid="health-dropdown"
          className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-background p-3 text-xs shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">System health: {LABEL[status]}</span>
            <Link href="/agent-log" className="text-muted-foreground underline" onClick={() => setOpen(false)}>
              Agent log
            </Link>
          </div>
          {nonGreen.length === 0 && health.reasons.length === 0 ? (
            <p className="text-muted-foreground">All checks passing.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(nonGreen.length > 0
                ? nonGreen
                : health.reasons.map((r) => ({ name: "", status, detail: r }))
              ).map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      c.status === "amber" && "bg-warning",
                      c.status === "red" && "bg-destructive",
                    )}
                  />
                  <span>
                    {c.name && <span className="font-medium">{c.name}: </span>}
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {checks.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-muted-foreground">All checks ({checks.length})</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {checks.map((c) => (
                  <li key={c.name} className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        c.status === "green" && "bg-success",
                        c.status === "amber" && "bg-warning",
                        c.status === "red" && "bg-destructive",
                      )}
                    />
                    <span>
                      <span className="font-medium">{c.name}:</span> {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">Refreshes every 60s.</p>
        </div>
      )}
    </div>
  );
}
