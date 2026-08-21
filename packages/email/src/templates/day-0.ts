import type { SequenceEmailVars } from "../types";
import {
  assembleRenderedEmail,
  resolveTemplateVars,
  senderFirstName,
  senderIntroSentence,
  type RenderedSequenceEmail,
} from "./shared";

const BODY = `Hi {{owner_first_name}},

{{sender_intro}}

{{observation_about_their_web_presence}}

I'd build you a simple site with your hours, location, contact information, and a few photos. The cost is $100 to build and $25 per month to keep it online and handle updates. If your hours change or you want new photos added, you email me and I take care of it.

If you're interested, I'll build a demo first at no cost so you can see it before deciding anything. We can talk about the rest from there.

Would that be useful?

Best,
{{sender_name}}`;

function interpolate(
  body: string,
  vars: { ownerFirstName: string; observation: string },
): string {
  return body
    .replace(/\{\{owner_first_name\}\}/g, vars.ownerFirstName)
    .replace(/\{\{observation_about_their_web_presence\}\}/g, vars.observation)
    .replace(/\{\{sender_intro\}\}/g, senderIntroSentence())
    .replace(/\{\{sender_name\}\}/g, senderFirstName());
}

export function renderDay0Email(
  vars: SequenceEmailVars,
  appUrl: string,
  physicalAddress: string,
): RenderedSequenceEmail {
  const resolved = resolveTemplateVars(vars, appUrl, physicalAddress);
  const subject = `Quick website idea for ${resolved.businessName}`;
  const bodyText = interpolate(BODY, {
    ownerFirstName: resolved.ownerFirstName,
    observation: resolved.observation,
  });

  return assembleRenderedEmail(subject, bodyText, vars, appUrl, physicalAddress, true);
}
