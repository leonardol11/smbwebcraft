"use client";

import { useState, useTransition } from "react";
import { discardDraft, sendDraft } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DraftActions({ messageId }: { messageId: string }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await sendDraft(messageId);
            setNotice(res?.message ?? null);
          })
        }
        data-testid={`send-draft-${messageId}`}
      >
        Send draft
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(() => discardDraft(messageId))}
      >
        Discard
      </Button>
      {notice && <span className="text-xs text-muted-foreground">{notice}</span>}
    </div>
  );
}
