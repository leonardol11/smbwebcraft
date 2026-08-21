"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendManualReply, type ReplyActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function ReplyComposer({
  threadId,
  sendingPaused,
  disabled,
}: {
  threadId: string;
  sendingPaused: boolean;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ReplyActionState, FormData>(sendManualReply, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2" data-testid="reply-composer">
      <input type="hidden" name="threadId" value={threadId} />
      <Textarea
        name="body"
        placeholder={disabled ? "Assign this thread to a lead before replying." : "Write a reply…"}
        rows={4}
        required
        disabled={disabled || pending}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={disabled || pending}>
          {sendingPaused ? "Save as draft" : "Send reply"}
        </Button>
        {sendingPaused && (
          <span className="text-xs text-warning">
            Sending is paused — replies will be stored as drafts.
          </span>
        )}
        {state && (
          <span className={state.ok ? "text-xs text-success" : "text-xs text-destructive"}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
