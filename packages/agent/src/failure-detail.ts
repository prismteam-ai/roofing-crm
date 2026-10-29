import {
  providerFailureDiagnostic,
  type ProviderFailureDiagnostic,
} from "./provider-failure";
import { DomainError } from "../../contracts/src/index";
export type GroundedFailureDetail =
  | ProviderFailureDiagnostic["kind"]
  | "retrieval_constraints"
  | "selection_schema"
  | "selection_ordinals"
  | "selection_order"
  | "selection_rationale"
  | "usage_invalid"
  | "usage_inconsistent"
  | "usage_budget"
  | "presentation_protocol";
const known: Readonly<Record<string, GroundedFailureDetail>> = Object.freeze({
  "Provider altered or omitted approved retrieval constraints":
    "retrieval_constraints",
  "Exactly one typed retrieval tool without mixed text or reasoning is required":
    "presentation_protocol",
  "Provider requested an unsupported retrieval tool": "presentation_protocol",
  "Provider supplied invalid grounded selection arguments": "selection_schema",
  "Grounded selection must be a unique bounded nonempty subset of retrieved ordinals":
    "selection_ordinals",
  "Provider changed the requested authoritative result order":
    "selection_order",
  // Retained to interpret historical v1 receipts; v2 accepts no model rationale.
  "Selection rationale is not supported by the minimized evidence":
    "selection_rationale",
  "Provider token usage was invalid": "usage_invalid",
  "Provider token usage was inconsistent": "usage_inconsistent",
  "Provider exceeded the token budget": "usage_budget",
  "Provider returned no valid assistant message": "presentation_protocol",
  "Provider mixed unsupported text with tool calls": "presentation_protocol",
  "Exactly one grounded presentation tool invocation is required":
    "presentation_protocol",
  "Provider requested an unsupported tool": "presentation_protocol",
});
/** Exact known application messages only. Never derive a response from arbitrary provider text/arguments or partial message matches. */
export function groundedFailureDetail(
  error: unknown,
): GroundedFailureDetail | undefined {
  const provider = providerFailureDiagnostic(error);
  if (provider) return provider.kind;
  return error instanceof DomainError && Object.hasOwn(known, error.message)
    ? known[error.message]
    : undefined;
}
