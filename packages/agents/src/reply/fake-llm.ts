import type { ReplyToolName } from "./tools";

export type ClassifyResult = {
  intent: string;
  tool: ReplyToolName;
  input: Record<string, unknown>;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
};

function classifyByKeywords(body: string, subject: string): ClassifyResult {
  const text = `${subject}\n${body}`.toLowerCase();

  if (
    text.includes("not interested") ||
    text.includes("unsubscribe") ||
    text.includes("stop emailing") ||
    text.includes("remove me")
  ) {
    return mk("not_interested", "mark_not_interested", { reason: "inbound_not_interested" });
  }

  if (
    text.includes("speak to a human") ||
    text.includes("talk to someone") ||
    text.includes("call me") ||
    text.includes("manager")
  ) {
    return mk("escalation", "escalate_to_human", { reason: "requested human" });
  }

  if (
    text.includes("how much") ||
    text.includes("price") ||
    text.includes("cost") ||
    text.includes("ready to pay") ||
    text.includes("sign up")
  ) {
    return mk("payment", "send_payment_link", {
      subject: "Re: Website setup",
      body: "Great — setup is $100 and hosting is $25/month. Use the link below to get started.",
    });
  }

  if (
    text.includes("preview") ||
    text.includes("see the site") ||
    text.includes("show me") ||
    text.includes("what would it look like")
  ) {
    return mk("preview_request", "send_preview", {
      subject: "Re: Website preview",
      body: "Here is a preview of what your site could look like. Let me know what you think!",
    });
  }

  if (text.includes("discount") || text.includes("cheaper") || text.includes("lower price")) {
    return mk("pricing_objection", "send_reply", {
      subject: "Re: Pricing",
      body: "Our pricing is $100 setup and $25/month — we keep it simple with no discounts.",
    });
  }

  if (text.includes("yes") || text.includes("interested") || text.includes("tell me more")) {
    return mk("interest", "send_reply", {
      subject: "Re: Website for your business",
      body: "Happy to help — we build a simple site for $100 setup and $25/month hosting.",
    });
  }

  if (text.includes("who are you") || text.includes("what company")) {
    return mk("question", "send_reply", {
      subject: "Re: About us",
      body: "We help local businesses get online with a simple website at $100 setup and $25/month.",
    });
  }

  if (text.includes("when") || text.includes("timeline") || text.includes("how long")) {
    return mk("timeline", "send_reply", {
      subject: "Re: Timeline",
      body: "Most sites go live within a few days after payment.",
    });
  }

  if (text.includes("domain") || text.includes("url")) {
    return mk("domain_question", "send_reply", {
      subject: "Re: Domain",
      body: "We can use your existing domain or help you pick one during setup.",
    });
  }

  if (text.includes("features") || text.includes("include")) {
    return mk("features", "send_reply", {
      subject: "Re: What's included",
      body: "Your site includes mobile-friendly design, contact info, and basic SEO.",
    });
  }

  if (text.includes("competitor") || text.includes("already have")) {
    return mk("objection", "send_reply", {
      subject: "Re: Your current site",
      body: "If you'd like a refresh, we can show a preview at no obligation.",
    });
  }

  if (text.includes("email") && text.includes("wrong")) {
    return mk("wrong_recipient", "mark_not_interested", { reason: "wrong_recipient" });
  }

  if (text.includes("legal") || text.includes("lawyer")) {
    return mk("legal", "escalate_to_human", { reason: "legal mention" });
  }

  if (text.includes("thanks") || text.includes("thank you")) {
    return mk("thanks", "send_reply", {
      subject: "Re: Thanks",
      body: "You're welcome! Let me know if you have any other questions.",
    });
  }

  if (text.includes("maybe") || text.includes("think about it")) {
    return mk("defer", "send_reply", {
      subject: "Re: Take your time",
      body: "No rush — reply whenever you're ready and we can send a preview.",
    });
  }

  if (text.includes("busy") || text.includes("later")) {
    return mk("busy", "send_reply", {
      subject: "Re: Follow up",
      body: "Understood — I'll check back later if that's okay.",
    });
  }

  if (text.includes("??") || text.includes("confused")) {
    return mk("confusion", "send_reply", {
      subject: "Re: Clarification",
      body: "Sorry for any confusion — we offer simple websites for local businesses at $100 + $25/mo.",
    });
  }

  return mk("default", "send_reply", {
    subject: "Re: Your business website",
    body: "Thanks for your reply! We offer website setup for $100 and $25/month hosting.",
  });
}

function mk(intent: string, tool: ReplyToolName, input: Record<string, unknown>): ClassifyResult {
  return {
    intent,
    tool,
    input,
    tokensIn: 100,
    tokensOut: 50,
    costMicroUsd: 0,
  };
}

export function classifyInboundFake(subject: string, body: string): ClassifyResult {
  return classifyByKeywords(body, subject);
}

export type ThreadTurn = { direction: "inbound" | "outbound"; body: string };

export interface ReplyLlm {
  classify(
    subject: string,
    body: string,
    leadContext: Record<string, unknown>,
    history?: ThreadTurn[],
  ): Promise<ClassifyResult>;
}

export class FakeReplyLlm implements ReplyLlm {
  async classify(subject: string, body: string): Promise<ClassifyResult> {
    return classifyInboundFake(subject, body);
  }
}
