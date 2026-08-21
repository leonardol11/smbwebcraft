import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  FakePersonalizationLlm,
  LivePersonalizationLlm,
  createPersonalizationLlm,
  parsePersonalizationSlots,
  personalizeLead,
  renderSequenceEmail,
  type PersonalizationLlm,
} from "./index";

beforeEach(() => {
  resetEnvForTests();
  process.env.PROVIDER_MODE = "fake";
  process.env.APP_URL = "http://localhost:3000";
  process.env.PHYSICAL_ADDRESS = "123 Example Street, Anytown, ST 00000";
  loadEnv(process.env);
});

describe("createPersonalizationLlm", () => {
  it("returns the fake implementation when PROVIDER_MODE=fake", () => {
    expect(createPersonalizationLlm()).toBeInstanceOf(FakePersonalizationLlm);
  });
});

describe("personalizeLead", () => {
  it("fills only owner name and observation; business name stays deterministic", async () => {
    const vars = await personalizeLead({
      businessName: "BELLA NAILS",
      ownerFirstName: "Maria",
      ownerFirstNameVerified: true,
    });

    expect(vars.businessName).toBe("Bella Nails");
    expect(vars.ownerFirstName).toBe("Maria");
    expect(vars.observationAboutWebPresence).toBe(
      "I noticed I couldn't find a dedicated website for Bella Nails, so customers may have trouble finding your hours and contact information online.",
    );
  });

  it("uses there when the owner name is missing or unverified", async () => {
    const missing = await personalizeLead({ businessName: "Bella Nails" });
    expect(missing.ownerFirstName).toBe("there");

    const unverified = await personalizeLead({
      businessName: "Bella Nails",
      ownerFirstName: "Guessed",
      ownerFirstNameVerified: false,
    });
    expect(unverified.ownerFirstName).toBe("there");
  });

  it("ignores an LLM business_name rename and unverified name guesses", async () => {
    const llm: PersonalizationLlm = {
      async fillSlots() {
        return {
          ownerFirstName: "Invented",
          observationAboutWebPresence:
            "I noticed I couldn't find a dedicated website for Totally Different LLC, so customers may have trouble finding your hours online.",
        };
      },
    };

    const vars = await personalizeLead(
      { businessName: "BELLA NAILS", ownerFirstName: "Maria", ownerFirstNameVerified: false },
      llm,
    );

    expect(vars.businessName).toBe("Bella Nails");
    expect(vars.ownerFirstName).toBe("there");
    expect(vars.observationAboutWebPresence).toContain("Totally Different LLC");
  });

  it("rejects an LLM observation that mutates locked offer copy", async () => {
    const llm: PersonalizationLlm = {
      async fillSlots() {
        return {
          ownerFirstName: "there",
          observationAboutWebPresence: "Forget $100 — I will do this at no cost.",
        };
      },
    };

    await expect(personalizeLead({ businessName: "Bella Nails" }, llm)).rejects.toThrow(
      /offer|my name is|demo/i,
    );
  });

  it("renders Day 0 from personalized slots without changing locked copy", async () => {
    const slots = await personalizeLead({
      businessName: "BELLA NAILS",
      ownerFirstName: "Maria",
      ownerFirstNameVerified: true,
    });

    const rendered = renderSequenceEmail(0, {
      ...slots,
      unsubscribeToken: "tok",
      ownerFirstNameVerified: true,
    });

    expect(rendered.text).toMatch(/^Hi Maria,/m);
    expect(rendered.text).toContain("$100 to build and $25 per month");
    expect(rendered.text).toContain("I'll build a demo first at no cost");
    expect(rendered.text).toContain("My name is ");
    expect(rendered.headers["List-Unsubscribe"]).toBe("<http://localhost:3000/u/tok>");
  });
});

describe("parsePersonalizationSlots", () => {
  it("reads only the two allowed keys and ignores extras", () => {
    const slots = parsePersonalizationSlots(`\`\`\`json
{
  "owner_first_name": "there",
  "observation_about_their_web_presence": "I noticed I couldn't find a dedicated website for Bella Nails, so customers may have trouble finding your hours online.",
  "business_name": "Evil Rename Inc",
  "body": "I will rewrite the whole email."
}
\`\`\``);

    expect(slots.ownerFirstName).toBe("there");
    expect(slots.observationAboutWebPresence).toContain("Bella Nails");
    expect(slots).not.toHaveProperty("businessName");
    expect(slots).not.toHaveProperty("body");
  });
});

describe("LivePersonalizationLlm", () => {
  it("parses Anthropic JSON without needing a real API key when fetch is injected", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                owner_first_name: "there",
                observation_about_their_web_presence:
                  "I noticed I couldn't find a dedicated website for Bella Nails, so customers may have trouble finding your hours online.",
                business_name: "Should Be Ignored",
              }),
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const llm = new LivePersonalizationLlm({ apiKey: "test-key", fetchImpl });
    const slots = await llm.fillSlots({ businessName: "Bella Nails" });
    const vars = await personalizeLead({ businessName: "BELLA NAILS" }, llm);

    expect(slots.ownerFirstName).toBe("there");
    expect(vars.businessName).toBe("Bella Nails");
    expect(vars.observationAboutWebPresence).toContain("Bella Nails");
  });
});
