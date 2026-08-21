import type { SequenceEmailVars } from "../types";
import {
  assembleRenderedEmail,
  resolveTemplateVars,
  senderFirstName,
  type RenderedSequenceEmail,
} from "./shared";

const BODY = `Hi {{owner_first_name}},

Just bumping this in case it got buried — I'm still happy to build a free demo site for {{business_name}} so you can see what it would look like before deciding anything.

Best,
{{sender_name}}`;

export function renderBumpEmail(
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
