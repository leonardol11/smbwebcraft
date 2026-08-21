import { buildListUnsubscribeHeaders } from "../client";
import { env } from "@outreach/env";
import type { RenderedEmail, SequenceEmailVars } from "../types";

export type RenderedSequenceEmail = RenderedEmail & {
  headers: Record<string, string>;
};

export const LOCKED_COPY_MARKERS = [
  "$100",
  "$25 per month",
  "demo first at no cost",
] as const;

/** Verbatim Day 0 paragraphs the LLM must not rewrite. */
/** Sender identity comes from env so nothing personal is hardcoded in the repo. */
export function senderFirstName(): string {
  return env().SENDER_FIRST_NAME;
}

export function senderIntroSentence(): string {
  return `My name is ${env().SENDER_FIRST_NAME}. ${env().SENDER_INTRO}`;
}

export const DAY0_LOCKED_PARAGRAPHS = [
  "I'd build you a simple site with your hours, location, contact information, and a few photos. The cost is $100 to build and $25 per month to keep it online and handle updates. If your hours change or you want new photos added, you email me and I take care of it.",
  "If you're interested, I'll build a demo first at no cost so you can see it before deciding anything. We can talk about the rest from there.",
  "Would that be useful?",
] as const;

const OBSERVATION_LOCKED_COPY_PATTERN =
  /\$\d|per month|my name is|demo first|at no cost|\$100|\$25/i;

const OBSERVATION_SHAMING_PATTERN =
  /\b(embarrassing|shameful|pathetic|amateur|unprofessional|lazy|incompetent)\b/i;

export function normalizeBusinessName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
    return trimmed
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return trimmed;
}

export function resolveOwnerFirstName(
  ownerFirstName?: string | null,
  verified = false,
): string {
  const name = ownerFirstName?.trim();
  if (verified && name) return name;
  return "there";
}

export function buildObservation(businessName: string, provided?: string): string {
  const custom = provided?.trim();
  if (custom) return custom;
  return `I noticed I couldn't find a dedicated website for ${businessName}, so customers may have trouble finding your hours and contact information online.`;
}

export function validateLockedCopy(text: string): void {
  const missing = LOCKED_COPY_MARKERS.filter((marker) => !text.includes(marker));
  if (missing.length > 0) {
    throw new Error(`Template missing locked copy: ${missing.join(", ")}`);
  }
}

export function validateDay0LockedCopy(text: string): void {
  validateLockedCopy(text);
  const missing = DAY0_LOCKED_PARAGRAPHS.filter((paragraph) => !text.includes(paragraph));
  if (missing.length > 0) {
    throw new Error(`Render changed locked surrounding copy: ${missing[0]}`);
  }
}

export function validateObservationSentence(observation: string): void {
  const trimmed = observation.trim();
  if (!trimmed) {
    throw new Error("Observation must be one factual sentence");
  }
  if (/[\r\n]/.test(trimmed)) {
    throw new Error("Observation must be a single line");
  }
  if (trimmed.length > 280) {
    throw new Error("Observation must be one short factual sentence");
  }
  if (!trimmed.endsWith(".")) {
    throw new Error("Observation must be one factual sentence ending with a period");
  }
  const sentenceCount = trimmed.split(/[.!?]+/).filter(Boolean).length;
  if (sentenceCount !== 1) {
    throw new Error("Observation must be exactly one sentence");
  }
  if (OBSERVATION_LOCKED_COPY_PATTERN.test(trimmed)) {
    throw new Error("Observation must not change the offer, intro sentence, or demo promise");
  }
  if (OBSERVATION_SHAMING_PATTERN.test(trimmed)) {
    throw new Error("Observation must be factual and must not shame the recipient");
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtmlParagraphs(body: string): string {
  return body
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

export function buildComplianceFooter(unsubscribeUrl: string, physicalAddress: string): {
  text: string;
  html: string;
} {
  const text = `\n\n---\n${physicalAddress}\nUnsubscribe: ${unsubscribeUrl}`;
  const html = `
<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
<p style="font-size:12px;color:#666;line-height:1.4;">
  ${escapeHtml(physicalAddress)}<br />
  <a href="${escapeHtml(unsubscribeUrl)}">Unsubscribe</a>
</p>`.trim();
  return { text, html };
}

export function wrapHtml(bodyHtml: string, footerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.5;color:#111;">
  <div style="max-width:600px;margin:0 auto;padding:16px;">
    ${bodyHtml}
    ${footerHtml}
  </div>
</body>
</html>`;
}

export interface ResolvedTemplateVars {
  businessName: string;
  ownerFirstName: string;
  observation: string;
  unsubscribeUrl: string;
}

export function resolveTemplateVars(vars: SequenceEmailVars, appUrl: string, physicalAddress: string): ResolvedTemplateVars {
  const businessName = normalizeBusinessName(vars.businessName);
  const ownerFirstName = resolveOwnerFirstName(
    vars.ownerFirstName,
    vars.ownerFirstNameVerified ?? Boolean(vars.ownerFirstName?.trim()),
  );
  const observation = buildObservation(businessName, vars.observationAboutWebPresence);
  validateObservationSentence(observation);
  const unsubscribeUrl = `${appUrl.replace(/\/$/, "")}/u/${vars.unsubscribeToken}`;

  return { businessName, ownerFirstName, observation, unsubscribeUrl };
}

export function assembleRenderedEmail(
  subject: string,
  bodyText: string,
  vars: SequenceEmailVars,
  appUrl: string,
  physicalAddress: string,
  validateLocked = false,
): RenderedSequenceEmail {
  const resolved = resolveTemplateVars(vars, appUrl, physicalAddress);
  const footer = buildComplianceFooter(resolved.unsubscribeUrl, physicalAddress);
  const text = `${bodyText}${footer.text}`;
  const html = wrapHtml(textToHtmlParagraphs(bodyText), footer.html);

  if (validateLocked) {
    validateDay0LockedCopy(text);
  }

  return {
    subject,
    html,
    text,
    headers: buildListUnsubscribeHeaders(resolved.unsubscribeUrl),
  };
}
