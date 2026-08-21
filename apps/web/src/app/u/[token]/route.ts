import { NextRequest, NextResponse } from "next/server";
import { env } from "@outreach/env";
import { verifyUnsubscribeToken } from "@outreach/email";
import { suppressEmail } from "@/lib/suppression";

export const dynamic = "force-dynamic";

const PAGE_STYLE = "font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem";

function page(body: string, status = 200) {
  return new NextResponse(`<!doctype html><html><body style="${PAGE_STYLE}">${body}</body></html>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function resolveEmail(token: string): string | null {
  return verifyUnsubscribeToken(token, env().SESSION_SECRET);
}

/** GET shows a confirmation page — link scanners must not unsubscribe by prefetching. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const email = resolveEmail(token);
  if (!email) return page("<h1>Invalid unsubscribe link</h1>", 400);
  return page(
    `<h1>Unsubscribe</h1>
<p>Stop receiving emails at <strong>${email.replace(/[<>&]/g, "")}</strong>?</p>
<form method="post"><button type="submit" style="padding:.6rem 1.2rem;font-size:1rem">Yes, unsubscribe</button></form>`,
  );
}

/** POST suppresses. Handles RFC 8058 one-click (form-encoded), the GET page form, and JSON. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const email = resolveEmail(token);
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  if (!email) {
    return wantsJson
      ? NextResponse.json({ error: "invalid" }, { status: 400 })
      : page("<h1>Invalid unsubscribe link</h1>", 400);
  }
  await suppressEmail(email, "unsubscribed");
  return wantsJson
    ? NextResponse.json({ ok: true })
    : page("<h1>Unsubscribed</h1><p>You will not receive further emails from us.</p>");
}
