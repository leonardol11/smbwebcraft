/**
 * Strip quoted reply history so only the correspondent's new text reaches the agent.
 * Handles Gmail, Outlook, and iPhone/Apple Mail plain-text (and HTML fallback) formats.
 */

const ON_WROTE =
  /^On[\s\S]{0,220}?wrote:\s*$/im;
const ORIGINAL_MESSAGE = /^-{2,}\s*Original Message\s*-{2,}\s*$/im;
const OUTLOOK_UNDERSCORES = /^_{5,}\s*$/m;
const FORWARDED = /^Begin forwarded message:\s*$/im;
/** Outlook / Windows Mail header block: From: … \n Sent: … */
const OUTLOOK_FROM_SENT = /(?:^|\n)From:\s.+\nSent:\s.+/i;
const MOBILE_SIGNATURE =
  /^\s*(Sent from my (?:iPhone|iPad|iPod|Galaxy|Android).*|Get Outlook for (?:iOS|Android).*)\s*$/gim;

export function stripQuotedHistory(
  bodyText: string | null | undefined,
  bodyHtml?: string | null,
): string {
  const raw =
    bodyText?.trim() ? bodyText : htmlToPlainText(stripHtmlQuoteContainers(bodyHtml ?? ""));
  const source = raw.replace(/\r\n/g, "\n").replace(/\u202f/g, " ");
  if (!source.trim()) return "";

  const cut = indexOfFirstQuoteMarker(source);
  let kept = cut === -1 ? source : source.slice(0, cut);
  kept = stripTrailingQuotedLines(kept);
  kept = kept.replace(MOBILE_SIGNATURE, "");
  return kept.trim();
}

export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header?.trim()) return [];
  const angled = header.match(/<[^>]+>/g);
  if (angled?.length) {
    return uniqueNormalized(angled.map(normalizeMessageId));
  }
  return uniqueNormalized(header.split(/\s+/).map(normalizeMessageId));
}

export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").trim().toLowerCase();
}

function indexOfFirstQuoteMarker(source: string): number {
  const candidates: number[] = [];
  for (const re of [ON_WROTE, ORIGINAL_MESSAGE, OUTLOOK_UNDERSCORES, FORWARDED]) {
    const match = re.exec(source);
    if (match?.index != null && match.index > 0) candidates.push(match.index);
    re.lastIndex = 0;
  }
  const outlook = OUTLOOK_FROM_SENT.exec(source);
  if (outlook) {
    const idx = source[outlook.index] === "\n" ? outlook.index + 1 : outlook.index;
    if (idx > 0) candidates.push(idx);
  }
  if (!candidates.length) return -1;
  return Math.min(...candidates);
}

function stripTrailingQuotedLines(text: string): string {
  const lines = text.split("\n");
  while (lines.length) {
    const last = lines[lines.length - 1] ?? "";
    if (/^\s*$/.test(last) || /^\s*>/.test(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n");
}

function stripHtmlQuoteContainers(html: string): string {
  if (!html) return "";
  return html
    .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[\s\S]*$/i, "")
    .replace(/<div[^>]*id="divRplyFwdMsg"[^>]*>[\s\S]*$/i, "")
    .replace(/<blockquote[\s\S]*$/i, "");
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/gi, "&");
}

function uniqueNormalized(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
