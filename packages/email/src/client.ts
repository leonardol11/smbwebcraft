import { Resend } from "resend";
import { env } from "@outreach/env";
import type { EmailClient, SendEmailParams, SendEmailResult, StoredSentEmail } from "./types";

const fakeSentEmails: StoredSentEmail[] = [];

export function getFakeSentEmails(): readonly StoredSentEmail[] {
  return fakeSentEmails;
}

export function clearFakeSentEmails(): void {
  fakeSentEmails.length = 0;
}

/** Reply-To plus-address for inbound thread matching: hello+lead_{id}@domain */
export function plusAddress(leadId: string): string {
  const { SENDER_LOCAL_PART, SENDING_DOMAIN } = env();
  return `${SENDER_LOCAL_PART}+lead_${leadId}@${SENDING_DOMAIN}`;
}

/** RFC 5322 From header: "Name <local@domain>" */
export function fromAddress(): string {
  const { SENDER_NAME, SENDER_LOCAL_PART, SENDING_DOMAIN } = env();
  return `${SENDER_NAME} <${SENDER_LOCAL_PART}@${SENDING_DOMAIN}>`;
}

export function buildListUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function buildThreadingHeaders(options: {
  inReplyTo?: string;
  references?: string[];
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (options.inReplyTo) {
    headers["In-Reply-To"] = options.inReplyTo;
  }
  if (options.references?.length) {
    headers.References = options.references.join(" ");
  }
  return headers;
}

function createFakeEmailClient(): EmailClient {
  return {
    async send(params: SendEmailParams): Promise<SendEmailResult> {
      const messageId = `fake-${crypto.randomUUID()}`;
      fakeSentEmails.push({
        ...params,
        messageId,
        sentAt: new Date(),
      });
      return { messageId };
    },
  };
}

function createResendEmailClient(): EmailClient {
  const resend = new Resend(env().RESEND_API_KEY);

  return {
    async send(params: SendEmailParams): Promise<SendEmailResult> {
      const { data, error } = await resend.emails.send(
        {
          from: params.from,
          to: params.to,
          replyTo: params.replyTo,
          subject: params.subject,
          html: params.html,
          text: params.text,
          headers: params.headers,
        },
        params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
      );

      if (error) {
        throw new Error(`Resend send failed: ${error.message}`);
      }
      if (!data?.id) {
        throw new Error("Resend send failed: missing message id");
      }

      return { messageId: data.id };
    },
  };
}

/**
 * Build an email client for the given provider mode (defaults to env
 * PROVIDER_MODE). In "fake" mode sends are captured in memory and readable
 * via getFakeSentEmails(), so tests and offline dev never hit Resend.
 */
export function createEmailClient(mode: "fake" | "live" = env().PROVIDER_MODE): EmailClient {
  return mode === "fake" ? createFakeEmailClient() : createResendEmailClient();
}

let cachedClient: EmailClient | undefined;

export function getEmailClient(): EmailClient {
  if (!cachedClient) {
    cachedClient = createEmailClient();
  }
  return cachedClient;
}

/** Test helper: reset cached client after env changes. */
export function resetEmailClientForTests(): void {
  cachedClient = undefined;
  clearFakeSentEmails();
}
