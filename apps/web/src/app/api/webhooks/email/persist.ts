import { inboundEmails, type Db } from "@outreach/db";
import { enqueueJob } from "@/jobs/enqueue";

export const PROCESS_INBOUND_JOB = "email.process_inbound";

/**
 * Queue inbound processing without awaiting it. The webhook must ack before
 * matcher / reply-agent work (T17/T18) runs.
 */
export function enqueueInboundProcessing(inboundEmailId: string): void {
  void enqueueJob(PROCESS_INBOUND_JOB, { inboundEmailId }).catch(() => {
    // Persistence already succeeded; replay can re-queue.
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function emailFromField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const angled = /<([^>]+)>/.exec(trimmed);
    return (angled?.[1] ?? trimmed).trim() || null;
  }
  if (Array.isArray(value)) return emailFromField(value[0]);
  const rec = asRecord(value);
  if (!rec) return null;
  return emailFromField(rec.email ?? rec.address ?? rec.from ?? rec.to);
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const rec = asRecord(entry);
      if (!rec) continue;
      if (String(rec.name ?? rec.key ?? "").toLowerCase() === lower) {
        return stringField(rec.value);
      }
    }
    return null;
  }
  const rec = asRecord(headers);
  if (!rec) return null;
  for (const [key, value] of Object.entries(rec)) {
    if (key.toLowerCase() === lower) return stringField(value);
  }
  return null;
}

export type InboundFields = {
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
};

/** Pull common Resend inbound / fake-payload fields without matching threads. */
export function parseInboundFields(payload: unknown): InboundFields {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root ?? {};
  const headers = data.headers ?? root?.headers;

  return {
    fromEmail: emailFromField(data.from ?? data.from_email ?? data.fromEmail),
    toEmail: emailFromField(data.to ?? data.to_email ?? data.toEmail),
    subject: stringField(data.subject),
    messageId: stringField(
      data.message_id ?? data.messageId ?? data.email_id ?? data.emailId,
    ),
    inReplyTo: stringField(data.in_reply_to ?? data.inReplyTo) ?? headerValue(headers, "in-reply-to"),
    referencesHeader:
      stringField(data.references ?? data.references_header) ?? headerValue(headers, "references"),
    bodyText: stringField(data.text ?? data.body_text ?? data.bodyText),
    bodyHtml: stringField(data.html ?? data.body_html ?? data.bodyHtml),
  };
}

export async function persistInboundEmail(db: Db, payload: unknown): Promise<{ id: string }> {
  const fields = parseInboundFields(payload);
  const [row] = await db
    .insert(inboundEmails)
    .values({
      ...fields,
      raw: payload,
      matchStatus: "pending",
    })
    .returning({ id: inboundEmails.id });
  if (!row) throw new Error("failed to persist inbound email");
  return row;
}
