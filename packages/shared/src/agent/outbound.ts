// A request to send, email, text, call or contact owners (or anyone) is outside this CRM: outreach
// is a "Coming soon" item and the README puts outbound messaging out of scope. The agent's scope
// gate refuses it with the typed outcome `out_of_scope` and this marker in `plan.unsupported`
// (reason `out_of_scope`), so the Ask screen can say why instead of giving a place-based message.

/** The constraint text the refusal records in `plan.unsupported`. */
export const OUTBOUND_CONSTRAINT = "send messages to owners";

const CONTACT_VERB =
  "(?:e-?mail(?:ing)?|text(?:ing)?|sms|call(?:ing)?|phone|phoning|contact(?:ing)?|message|messaging|" +
  "mail|notify|dm|ring|reach\\s+out\\s+to|get\\s+in\\s+touch\\s+with|write\\s+to)";
const FILLER = "(?:the|all|of|those|these|every|each|their|property|home|house|roof|and)";
const PEOPLE =
  "(?:owners?|homeowners?|residents?|occupants?|landlords?|tenants?|them|everyone|anyone|people|" +
  "contractors?|customers?|prospects?|leads?)";

/** An imperative contact verb followed (past at most three filler words) by who to contact, or a
 *  "send ... message/email/offer ... to owners" request. Deliberately narrow: "owner contact for
 *  X", "owners' mailing area" and "send them to the model" are not outbound requests. */
const OUTBOUND = new RegExp(
  "(?:^|[.,;!?]\\s*|\\b(?:and|then|also|please|can you|could you|would you|will you|i want to|i need to|let's|lets)\\s+)" +
    CONTACT_VERB +
    "\\s+(?:" +
    FILLER +
    "\\s+){0,3}" +
    PEOPLE +
    "\\b|" +
    "\\bsend\\b[^.?!]{0,50}\\b(?:e-?mails?|texts?|sms|messages?|letters?|mailers?|flyers?|offers?|quotes?|invit\\w*|notices?)\\b[^.?!]{0,40}\\b(?:to|for)\\b[^.?!]{0,30}\\b" +
    PEOPLE +
    "\\b|" +
    "\\bsend\\s+(?:out\\s+)?(?:the\\s+)?(?:owners?|homeowners?|them)\\s+(?:an?\\s+)?(?:e-?mail|text|sms|message|letter|mailer|offer)",
  "i",
);

/** True when the question asks the CRM to contact someone. */
export function asksToContactOwners(question: string): boolean {
  return OUTBOUND.test(question.trim());
}

/** True when a plan's `unsupported` entry is the outbound-messaging refusal marker, whether the
 *  gate wrote it or the plan model flagged the request itself. */
export function isOutboundConstraint(constraint: string): boolean {
  return (
    constraint === OUTBOUND_CONSTRAINT ||
    /\b(?:send|sending|outreach|outbound|messaging)\b/i.test(constraint) ||
    asksToContactOwners(constraint)
  );
}

/** The plain-language refusal the Ask screen shows (and nothing here names an owner). */
export const OUTBOUND_REFUSAL_TEXT =
  "This CRM does not send messages to owners. Outreach is a “Coming soon” item, so I did not " +
  "search or contact anyone. I can list the properties that match (for example roofs older than a " +
  "given age near a place) or propose them as leads for you to follow up yourself.";
