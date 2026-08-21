import { env } from "@outreach/env";
import {
  buildObservation,
  normalizeBusinessName,
  resolveOwnerFirstName,
  validateObservationSentence,
} from "./shared";

export interface PersonalizationInput {
  businessName: string;
  ownerFirstName?: string | null;
  ownerFirstNameVerified?: boolean;
  city?: string | null;
  category?: string | null;
  websiteUrl?: string | null;
  webPresenceFacts?: string[];
}

/** The only two slots an LLM is allowed to fill. */
export interface PersonalizationSlots {
  ownerFirstName: string;
  observationAboutWebPresence: string;
}

export interface PersonalizedLeadVars extends PersonalizationSlots {
  /** Filled by deterministic code only — never taken from the LLM. */
  businessName: string;
}

export interface PersonalizationLlm {
  fillSlots(input: PersonalizationInput): Promise<PersonalizationSlots>;
}

function policyOwnerFirstName(input: PersonalizationInput): string {
  return resolveOwnerFirstName(input.ownerFirstName, input.ownerFirstNameVerified === true);
}

function constrainSlots(
  input: PersonalizationInput,
  businessName: string,
  raw: PersonalizationSlots,
): PersonalizationSlots {
  const ownerFirstName = policyOwnerFirstName(input);
  const observation = raw.observationAboutWebPresence?.trim() || buildObservation(businessName);
  validateObservationSentence(observation);
  return { ownerFirstName, observationAboutWebPresence: observation };
}

export class FakePersonalizationLlm implements PersonalizationLlm {
  async fillSlots(input: PersonalizationInput): Promise<PersonalizationSlots> {
    const businessName = normalizeBusinessName(input.businessName);
    return {
      ownerFirstName: policyOwnerFirstName(input),
      observationAboutWebPresence: buildObservation(businessName),
    };
  }
}

type AnthropicMessageResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

export class LivePersonalizationLlm implements PersonalizationLlm {
  constructor(
    private readonly options: {
      apiKey?: string;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async fillSlots(input: PersonalizationInput): Promise<PersonalizationSlots> {
    const apiKey = this.options.apiKey ?? env().ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for live email personalization");
    }

    const businessName = normalizeBusinessName(input.businessName);
    const verifiedName =
      input.ownerFirstNameVerified === true ? input.ownerFirstName?.trim() || "" : "";
    const facts = input.webPresenceFacts?.filter(Boolean).join("; ") || "no dedicated website found";

    const prompt = `You fill two slots in a locked cold-email template. Return JSON only with exactly these keys:
- owner_first_name
- observation_about_their_web_presence

Rules:
- owner_first_name: if a verified first name is provided, echo it exactly. Otherwise return "there". Never invent or guess a name.
- observation_about_their_web_presence: exactly one factual sentence ending with a period. No shaming. Do not mention price, the sender's background, demos, or change the offer.
- Do not rename the business. Use this exact business name if you mention it: ${businessName}

Verified owner first name: ${verifiedName || "(none — use there)"}
City: ${input.city ?? "unknown"}
Category: ${input.category ?? "unknown"}
Website URL: ${input.websiteUrl ?? "(none)"}
Facts: ${facts}

Preferred observation: I noticed I couldn't find a dedicated website for ${businessName}, so customers may have trouble finding your hours and contact information online.`;

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic personalization failed: ${response.status}`);
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    const text = payload.content?.find((block) => block.type === "text")?.text ?? "";
    return parsePersonalizationSlots(text);
  }
}

export function parsePersonalizationSlots(raw: string): PersonalizationSlots {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Personalization LLM did not return JSON slots");
  }

  const parsed = JSON.parse(jsonMatch[0]!) as Record<string, unknown>;
  const ownerFirstName =
    typeof parsed.owner_first_name === "string" ? parsed.owner_first_name : "";
  const observationAboutWebPresence =
    typeof parsed.observation_about_their_web_presence === "string"
      ? parsed.observation_about_their_web_presence
      : "";

  return { ownerFirstName, observationAboutWebPresence };
}

export function createPersonalizationLlm(llm?: PersonalizationLlm): PersonalizationLlm {
  if (llm) return llm;
  return env().PROVIDER_MODE === "live" ? new LivePersonalizationLlm() : new FakePersonalizationLlm();
}

/**
 * Fill template slots. The LLM may propose only owner_first_name and
 * observation; business_name is always normalized in code. Unverified names
 * become "there". Invalid observations are rejected.
 */
export async function personalizeLead(
  input: PersonalizationInput,
  llm: PersonalizationLlm = createPersonalizationLlm(),
): Promise<PersonalizedLeadVars> {
  const businessName = normalizeBusinessName(input.businessName);
  const raw = await llm.fillSlots({ ...input, businessName });
  const slots = constrainSlots(input, businessName, raw);
  return { businessName, ...slots };
}
