import { beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvForTests } from "@outreach/env";
import {
  DAY0_LOCKED_PARAGRAPHS,
  LOCKED_COPY_MARKERS,
  renderSequenceEmail,
  resolveOwnerFirstName,
  validateObservationSentence,
} from "./index";
import type { SequenceStep } from "../types";

beforeEach(() => {
  resetEnvForTests();
  process.env.PROVIDER_MODE = "fake";
  process.env.APP_URL = "http://localhost:3000";
  process.env.PHYSICAL_ADDRESS = "123 Example Street, Anytown, ST 00000";
  loadEnv(process.env);
});

const baseVars = {
  businessName: "BELLA NAILS",
  unsubscribeToken: "test-token",
};

const LOCKED_COPY_FIXTURES: Array<{
  step: SequenceStep;
  ownerFirstName?: string;
  ownerFirstNameVerified?: boolean;
  greeting: string;
  checkDay0Locked: boolean;
}> = [
  { step: 0, greeting: "Hi there,", checkDay0Locked: true },
  {
    step: 0,
    ownerFirstName: "Maria",
    ownerFirstNameVerified: true,
    greeting: "Hi Maria,",
    checkDay0Locked: true,
  },
  { step: 3, greeting: "Hi there,", checkDay0Locked: false },
  { step: 7, greeting: "Hi there,", checkDay0Locked: false },
];

describe("renderSequenceEmail", () => {
  it("preserves locked Day 0 copy exactly", () => {
    const { subject, text } = renderSequenceEmail(0, baseVars);

    expect(subject).toBe("Quick website idea for Bella Nails");
    for (const marker of LOCKED_COPY_MARKERS) {
      expect(text).toContain(marker);
    }
    expect(text).toContain("$100 to build and $25 per month");
    expect(text).toContain("I'll build a demo first at no cost");
    expect(text).toContain("My name is ");
  });

  it("uses verified owner first name in greeting", () => {
    const { text } = renderSequenceEmail(0, {
      ...baseVars,
      ownerFirstName: "Maria",
      ownerFirstNameVerified: true,
    });
    expect(text).toMatch(/^Hi Maria,/m);
  });

  it('falls back to "Hi there," when owner name is not verified', () => {
    const { text } = renderSequenceEmail(0, {
      ...baseVars,
      ownerFirstName: "Maria",
      ownerFirstNameVerified: false,
    });
    expect(text).toMatch(/^Hi there,/m);
  });

  it('falls back to "Hi there," when no owner name is provided', () => {
    const { text } = renderSequenceEmail(0, baseVars);
    expect(text).toMatch(/^Hi there,/m);
  });

  it("includes compliance footer with physical address and unsubscribe link", () => {
    const { text, html } = renderSequenceEmail(0, baseVars);
    expect(text).toContain("123 Example Street, Anytown, ST 00000");
    expect(text).toContain("http://localhost:3000/u/test-token");
    expect(html).toContain("123 Example Street, Anytown, ST 00000");
    expect(html).toContain('href="http://localhost:3000/u/test-token"');
  });

  it("attaches RFC 8058 List-Unsubscribe headers", () => {
    const { headers } = renderSequenceEmail(0, baseVars);
    expect(headers["List-Unsubscribe"]).toBe("<http://localhost:3000/u/test-token>");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("renders valid HTML including the compliance footer", () => {
    const { html } = renderSequenceEmail(0, baseVars);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("<p>");
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("123 Example Street, Anytown, ST 00000");
  });

  it("renders bump and final follow-ups with Re: subject", () => {
    const bump = renderSequenceEmail(3, baseVars);
    const final = renderSequenceEmail(7, baseVars);
    expect(bump.subject).toBe("Re: Quick website idea for Bella Nails");
    expect(final.subject).toBe("Re: Quick website idea for Bella Nails");
  });

  it.each(LOCKED_COPY_FIXTURES)(
    "fixture step $step greeting $greeting preserves locked copy",
    (fixture) => {
      const rendered = renderSequenceEmail(fixture.step, {
        ...baseVars,
        ownerFirstName: fixture.ownerFirstName,
        ownerFirstNameVerified: fixture.ownerFirstNameVerified,
      });

      expect(rendered.text).toMatch(new RegExp(`^${fixture.greeting}`, "m"));
      expect(rendered.text).toContain("123 Example Street, Anytown, ST 00000");
      expect(rendered.html).toContain("123 Example Street, Anytown, ST 00000");
      expect(rendered.html).toContain('href="http://localhost:3000/u/test-token"');
      expect(rendered.headers["List-Unsubscribe"]).toBe("<http://localhost:3000/u/test-token>");
      expect(rendered.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

      if (fixture.checkDay0Locked) {
        for (const paragraph of DAY0_LOCKED_PARAGRAPHS) {
          expect(rendered.text).toContain(paragraph);
        }
        for (const marker of LOCKED_COPY_MARKERS) {
          expect(rendered.text).toContain(marker);
        }
      }
    },
  );

  it("rejects an observation that mutates the offer", () => {
    expect(() =>
      renderSequenceEmail(0, {
        ...baseVars,
        observationAboutWebPresence: "I will build the site for $50 instead of the usual rate.",
      }),
    ).toThrow(/offer|my name is|demo/i);
  });

  it("accepts a single factual observation that leaves locked copy intact", () => {
    const observation =
      "I noticed Bella Nails only appears on Instagram, so customers may have trouble finding your hours online.";
    const { text } = renderSequenceEmail(0, {
      ...baseVars,
      observationAboutWebPresence: observation,
    });
    expect(text).toContain(observation);
    for (const paragraph of DAY0_LOCKED_PARAGRAPHS) {
      expect(text).toContain(paragraph);
    }
  });
});

describe("validateObservationSentence", () => {
  it("accepts the default factual sentence", () => {
    expect(() =>
      validateObservationSentence(
        "I noticed I couldn't find a dedicated website for Bella Nails, so customers may have trouble finding your hours and contact information online.",
      ),
    ).not.toThrow();
  });

  it("rejects multiple sentences", () => {
    expect(() =>
      validateObservationSentence("I could not find a site. Customers may be confused."),
    ).toThrow(/exactly one sentence/);
  });

  it("rejects a sentence that restates the intro or demo copy", () => {
    expect(() =>
      validateObservationSentence("My name is Sam and I offer a demo first at no cost."),
    ).toThrow(/offer|my name is|demo/);
  });
});

describe("resolveOwnerFirstName", () => {
  it("returns there when unverified", () => {
    expect(resolveOwnerFirstName("Sam", false)).toBe("there");
    expect(resolveOwnerFirstName(null, true)).toBe("there");
  });
});
