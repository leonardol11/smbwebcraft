import Anthropic from "@anthropic-ai/sdk";
import { env } from "@outreach/env";
import { FakeReplyLlm, type ClassifyResult, type ReplyLlm, type ThreadTurn } from "./fake-llm";
import { POLICY_RULES, PRICING } from "./policy";
import type { ReplyToolName } from "./tools";
import { replyToolNames } from "./tools";

export const REPLY_MODEL = "claude-opus-5";
// $/1M tokens → micro-USD per token
const INPUT_MICRO_USD_PER_TOKEN = 5;
const OUTPUT_MICRO_USD_PER_TOKEN = 25;

const bodySchema = {
  type: "object" as const,
  properties: {
    subject: { type: "string", description: "Reply subject. Keep the existing thread subject with a 'Re:' prefix." },
    body: { type: "string", description: "Plain-text reply, 2–5 short sentences, friendly and direct. No markdown." },
  },
  required: ["body"],
  additionalProperties: false,
};

const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "send_reply",
    description:
      "Answer a question or objection and keep the conversation going. Use for general interest, questions about features, timeline, domains, who we are, or polite deferrals.",
    input_schema: bodySchema,
  },
  {
    name: "send_preview",
    description:
      "The owner asked to see what their site would look like. The reply is sent with a link to a preview of their generated site.",
    input_schema: bodySchema,
  },
  {
    name: "send_payment_link",
    description:
      "The owner asked about price or is ready to buy. State the fixed pricing; a Stripe payment link is appended automatically — do not invent a URL.",
    input_schema: bodySchema,
  },
  {
    name: "mark_not_interested",
    description:
      "The owner declined, asked to stop emailing, or we reached the wrong person. Nothing is sent; the address is suppressed.",
    input_schema: {
      type: "object" as const,
      properties: { reason: { type: "string" } },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand off to a person: phone-call requests, legal threats, complaints, anything outside the simple website offer, or when you are unsure. Nothing is sent.",
    input_schema: {
      type: "object" as const,
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `You are the email reply assistant for a small service that builds simple websites for local businesses that don't have one.

Offer: ${PRICING.setupDisplay} one-time setup + ${PRICING.monthlyDisplay} hosting. A mobile-friendly one-page site with the business's hours, services, contact info, map, and basic SEO, live within a few days of payment. We can use their existing domain or help them pick one.

${POLICY_RULES}

Write like a helpful human, not a marketer: short, specific, no hype, no exclamation-mark pileups. Never mention that you are an AI. Always respond by calling exactly one tool.`;

function isToolName(name: string): name is ReplyToolName {
  return (replyToolNames as readonly string[]).includes(name);
}

export class LiveReplyLlm implements ReplyLlm {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? env().ANTHROPIC_API_KEY });
  }

  async classify(
    subject: string,
    body: string,
    leadContext: Record<string, unknown>,
    history: ThreadTurn[] = [],
  ): Promise<ClassifyResult> {
    const transcript = history
      .map((t) => `[${t.direction === "outbound" ? "US" : "OWNER"}] ${t.body.trim()}`)
      .join("\n\n---\n\n");

    const prompt = `Lead context (the only facts you may use about the business):
${JSON.stringify(leadContext, null, 2)}

${transcript ? `Earlier messages in this thread, oldest first:\n\n${transcript}\n\n` : ""}Newest inbound email from the owner:
Subject: ${subject || "(none)"}
Body:
${body || "(empty)"}

Pick the single best tool and write the reply if one is needed.`;

    const response = await this.client.messages.create({
      model: REPLY_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: prompt }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costMicroUsd = Math.round(
      tokensIn * INPUT_MICRO_USD_PER_TOKEN + tokensOut * OUTPUT_MICRO_USD_PER_TOKEN,
    );
    const usage = { tokensIn, tokensOut, costMicroUsd };

    if (response.stop_reason === "refusal") {
      return {
        intent: "model_refusal",
        tool: "escalate_to_human",
        input: { reason: `Model declined: ${response.stop_details?.explanation ?? "refusal"}` },
        ...usage,
      };
    }

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse || !isToolName(toolUse.name)) {
      return {
        intent: "no_tool_call",
        tool: "escalate_to_human",
        input: { reason: "Model did not return a valid tool call" },
        ...usage,
      };
    }

    return {
      intent: toolUse.name,
      tool: toolUse.name,
      input: (toolUse.input ?? {}) as Record<string, unknown>,
      ...usage,
    };
  }
}

export function createReplyLlm(llm?: ReplyLlm): ReplyLlm {
  if (llm) return llm;
  return env().PROVIDER_MODE === "live" ? new LiveReplyLlm() : new FakeReplyLlm();
}
