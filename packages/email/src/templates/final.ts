import type { SequenceEmailVars } from "../types";
import {
  assembleRenderedEmail,
  resolveTemplateVars,
  senderFirstName,
  type RenderedSequenceEmail,
} from "./shared";

const BODY = `Hi {{owner_first_name}},

Last note from me — I can still put together a no-cost demo for {{business_name}} if you'd like to see what a simple site would look like. Otherwise no worries at all.

Best,
{{sender_name}}`;

export function renderFinalEmail(
  vars: SequenceEmailVars,
  appUrl: string,
  physicalAddress: string,
): RenderedSequenceEmail {
  const resolved = resolveTemplateVars(vars, appUrl, physicalAddress);
  const subject = `Re: Quick website idea for ${resolved.businessName}`;
  const bodyText = BODY.replace(/\{\{owner_first_name\}\}/g, resolved.ownerFirstName).replace(
    /\{\{business_name\}\}/g,
    resolved.businessName,
  ).replace(/\{\{sender_name\}\}/g, senderFirstName());

  return assembleRenderedEmail(subject, bodyText, vars, appUrl, physicalAddress);
}
