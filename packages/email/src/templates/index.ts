import { env } from "@outreach/env";
import type { SequenceEmailVars, SequenceStep } from "../types";
import { renderBumpEmail } from "./bump";
import { renderDay0Email } from "./day-0";
import { renderFinalEmail } from "./final";
import type { RenderedSequenceEmail } from "./shared";

export {
  DAY0_LOCKED_PARAGRAPHS,
  LOCKED_COPY_MARKERS,
  buildComplianceFooter,
  buildObservation,
  normalizeBusinessName,
  resolveOwnerFirstName,
  validateDay0LockedCopy,
  validateLockedCopy,
  validateObservationSentence,
  type RenderedSequenceEmail,
} from "./shared";

export {
  FakePersonalizationLlm,
  LivePersonalizationLlm,
  createPersonalizationLlm,
  parsePersonalizationSlots,
  personalizeLead,
  type PersonalizationInput,
  type PersonalizationLlm,
  type PersonalizationSlots,
  type PersonalizedLeadVars,
} from "./personalize";

const RENDERERS: Record<SequenceStep, typeof renderDay0Email> = {
  0: renderDay0Email,
  3: renderBumpEmail,
  7: renderFinalEmail,
};

export function renderSequenceEmail(
  step: SequenceStep,
  vars: SequenceEmailVars,
): RenderedSequenceEmail {
  const { APP_URL, PHYSICAL_ADDRESS } = env();
  const render = RENDERERS[step];
  if (!render) {
    throw new Error(`Unknown sequence step: ${step}`);
  }
  return render(vars, APP_URL, PHYSICAL_ADDRESS);
}

export { renderDay0Email } from "./day-0";
export { renderBumpEmail } from "./bump";
export { renderFinalEmail } from "./final";
