"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Client-side modal shell for the campaign create form. The form itself is a
 * server component passed as children so its server action wiring stays intact;
 * the modal closes when the form submits (the submit event bubbles up here).
 */
export function CampaignCreateModal({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
        data-testid="new-campaign-button"
      >
        <Plus className="h-3.5 w-3.5" /> New campaign
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New campaign"
            className="relative w-full max-w-lg"
            onSubmit={() => setOpen(false)}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="absolute right-2 top-2 z-10"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
