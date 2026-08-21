export type SequenceStep = 0 | 3 | 7;

export const SEQUENCE_STEPS: readonly SequenceStep[] = [0, 3, 7];

export type ResendDeliveryEventType =
  | "email.delivered"
  | "email.bounced"
  | "email.complained"
  | "email.opened";

export type DeliveryEventType = "delivered" | "bounced" | "complained" | "opened";

export interface SendEmailParams {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export interface EmailClient {
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

export interface StoredSentEmail extends SendEmailParams {
  messageId: string;
  sentAt: Date;
}

export interface SequenceEmailVars {
  businessName: string;
  /** Verified owner first name; omit or leave unverified for "there". */
  ownerFirstName?: string | null;
  ownerFirstNameVerified?: boolean;
  /** One factual sentence; generated deterministically when omitted. */
  observationAboutWebPresence?: string;
  unsubscribeToken: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Subset of node:dns promises API, injectable for offline tests. */
export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolveMx(name: string): Promise<{ priority: number; exchange: string }[]>;
}

export interface DnsRecordStatus {
  ok: boolean;
  detail: string;
}

export interface DnsHealthResult {
  domain: string;
  spf: DnsRecordStatus;
  dkim: DnsRecordStatus;
  dmarc: DnsRecordStatus;
  mx: DnsRecordStatus;
  allOk: boolean;
}

/** Minimal lead shape for pure sequence helpers (no DB coupling). */
export interface SequenceLead {
  status: string;
  email?: string | null;
  lastTouchAt?: Date | string | null;
  /** Time of the Day 0 send; follow-ups are scheduled from this, not last touch. */
  sequenceStartedAt?: Date | string | null;
  suppressed?: boolean;
  hasReplied?: boolean;
  hasBounced?: boolean;
  hasComplained?: boolean;
}
