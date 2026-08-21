import Anthropic from "@anthropic-ai/sdk";
import { env } from "@outreach/env";
import { FakeSiteCopyLlm, type CopyInput, type SiteCopyLlm } from "./copy-llm";
import { parseSiteCopy } from "./schema";

const MODEL = "claude-opus-5";
// Claude Opus 5 list price: $5 / 1M input, $25 / 1M output => micro-USD per token.
const INPUT_MICRO_USD_PER_TOKEN = 5;
const OUTPUT_MICRO_USD_PER_TOKEN = 25;

export class LiveSiteCopyLlm implements SiteCopyLlm {
  private client: Anthropic;
  private fallback = new FakeSiteCopyLlm();

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? env().ANTHROPIC_API_KEY });
  }

  async generateCopy(input: CopyInput) {
    const rating = input.placesData?.rating;
    const reviewCount = input.placesData?.reviewCount;
    const prompt = `Generate website copy for a local business.

Business: ${input.businessName}
Category: ${input.category ?? "general"}
City: ${input.city ?? "unknown"}
Template: ${input.template}
Rating: ${typeof rating === "number" ? rating : "unknown"}
Review count: ${typeof reviewCount === "number" ? reviewCount : "unknown"}

Return JSON only with keys: tagline (string), about (string), services (array of 1-6 short strings).
You may mention the rating and review count only if they are provided numbers.
Do not invent prices, awards, certifications, or years in business. Keep copy concise and professional.`;

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: prompt }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costMicroUsd = Math.round(
      tokensIn * INPUT_MICRO_USD_PER_TOKEN + tokensOut * OUTPUT_MICRO_USD_PER_TOKEN,
    );

    // Safety refusal: fall back to deterministic copy rather than failing the build.
    if (response.stop_reason === "refusal") {
      const fallback = await this.fallback.generateCopy(input);
      return { ...fallback, tokensIn, tokensOut, costMicroUsd };
    }

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse site copy JSON from Claude");

    const copy = parseSiteCopy(JSON.parse(jsonMatch[0]!) as unknown);
    return { copy, tokensIn, tokensOut, costMicroUsd };
  }
}

export function createSiteCopyLlm(llm?: SiteCopyLlm): SiteCopyLlm {
  if (llm) return llm;
  return env().PROVIDER_MODE === "live" ? new LiveSiteCopyLlm() : new FakeSiteCopyLlm();
}

export { FakeSiteCopyLlm, type SiteCopyLlm } from "./copy-llm";
