/** Distinct new-reply line used across Gmail / Outlook / iPhone fixtures. */
export const NEW_REPLY_TEXT = "Yes, I'd like a demo please.";

const ORIGINAL_OUTBOUND = `Hi Maria,

My name is Sam. I build simple websites for local businesses.

I noticed I couldn't find a dedicated website for Bella Nails, so customers may have trouble finding your hours and contact information online.

I'd build you a simple site with your hours, location, contact information, and a few photos. The cost is $100 to build and $25 per month to keep it online and handle updates.

Would that be useful?

Best,
Sam`;

export const ORIGINAL_OUTBOUND_SNIPPET = "I noticed I couldn't find a dedicated website for Bella Nails";

export type ReplyFixture = {
  name: "gmail" | "outlook" | "iphone";
  bodyText: string;
  bodyHtml?: string;
  inReplyTo: string;
  referencesHeader: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
};

/** Gmail web: attribution line + quoted history with `>` prefixes. */
export const GMAIL_REPLY: ReplyFixture = {
  name: "gmail",
  fromEmail: "maria@bellanails.test",
  toEmail: "hello+lead_LEADID@mail.yourdomain.com",
  subject: "Re: Quick website idea for Bella Nails",
  inReplyTo: "<outbound-msg-id@mail.yourdomain.com>",
  referencesHeader: "<outbound-msg-id@mail.yourdomain.com>",
  bodyText: `${NEW_REPLY_TEXT}

On Tue, Aug 18, 2026 at 3:14 PM Sam Taylor <hello+lead_LEADID@mail.yourdomain.com> wrote:
> Hi Maria,
>
> My name is Sam. I build simple websites for local businesses.
>
> ${ORIGINAL_OUTBOUND_SNIPPET}, so customers may have trouble finding your hours and contact information online.
>
> I'd build you a simple site with your hours, location, contact information, and a few photos. The cost is $100 to build and $25 per month to keep it online and handle updates.
>
> Would that be useful?
>
> Best,
> Sam
`,
};

/**
 * Outlook desktop / Microsoft 365: "Original Message" block plus From/Sent headers.
 */
export const OUTLOOK_REPLY: ReplyFixture = {
  name: "outlook",
  fromEmail: "maria@bellanails.test",
  toEmail: "hello+lead_LEADID@mail.yourdomain.com",
  subject: "RE: Quick website idea for Bella Nails",
  inReplyTo: "<outbound-msg-id@mail.yourdomain.com>",
  referencesHeader:
    "<thread-root@mail.yourdomain.com> <outbound-msg-id@mail.yourdomain.com>",
  bodyText: `${NEW_REPLY_TEXT}

-----Original Message-----
From: Sam Taylor <hello+lead_LEADID@mail.yourdomain.com>
Sent: Tuesday, August 18, 2026 3:14 PM
To: Maria <maria@bellanails.test>
Subject: Quick website idea for Bella Nails

${ORIGINAL_OUTBOUND}
`,
};

/**
 * iPhone Mail: "On …, at …, Name <email> wrote:" (narrow no-break space before PM)
 * plus a mobile signature.
 */
export const IPHONE_REPLY: ReplyFixture = {
  name: "iphone",
  fromEmail: "maria@bellanails.test",
  toEmail: "hello+lead_LEADID@mail.yourdomain.com",
  subject: "Re: Quick website idea for Bella Nails",
  inReplyTo: "<outbound-msg-id@mail.yourdomain.com>",
  referencesHeader: "<outbound-msg-id@mail.yourdomain.com>",
  bodyText: `${NEW_REPLY_TEXT}

Sent from my iPhone

On Aug 18, 2026, at 3:14\u202fPM, Sam Taylor <hello+lead_LEADID@mail.yourdomain.com> wrote:

${ORIGINAL_OUTBOUND}
`,
};

/** Outlook 365 sometimes uses an underscore separator instead of "Original Message". */
export const OUTLOOK_UNDERSCORE_REPLY_BODY = `${NEW_REPLY_TEXT}

________________________________
From: Sam Taylor <hello+lead_LEADID@mail.yourdomain.com>
Sent: Tuesday, August 18, 2026 3:14 PM
To: Maria <maria@bellanails.test>
Subject: Quick website idea for Bella Nails

${ORIGINAL_OUTBOUND}
`;

/** Gmail HTML fallback when plain text is missing. */
export const GMAIL_HTML_ONLY = `<div dir="ltr">${NEW_REPLY_TEXT}</div>
<div class="gmail_quote">
<div class="gmail_attr">On Tue, Aug 18, 2026 at 3:14 PM Sam Taylor &lt;hello@mail.yourdomain.com&gt; wrote:<br></div>
<blockquote class="gmail_quote">${ORIGINAL_OUTBOUND.replace(/\n/g, "<br>")}</blockquote>
</div>`;

export const REPLY_FIXTURES: ReplyFixture[] = [GMAIL_REPLY, OUTLOOK_REPLY, IPHONE_REPLY];

export function withLeadId(fixture: ReplyFixture, leadId: string): ReplyFixture {
  const replace = (s: string) => s.replaceAll("LEADID", leadId);
  return {
    ...fixture,
    toEmail: replace(fixture.toEmail),
    bodyText: replace(fixture.bodyText),
    bodyHtml: fixture.bodyHtml ? replace(fixture.bodyHtml) : fixture.bodyHtml,
  };
}
