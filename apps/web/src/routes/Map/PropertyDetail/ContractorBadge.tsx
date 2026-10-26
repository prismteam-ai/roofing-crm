// B-03 contractor-resolution badge (tasks.md T037; AC-6, AC-7, FR-007). Reads `CrmPermit`'s own
// `contractorResolution` enum verbatim (`resolved` | `unresolved` — `packages/oracle-contract`'s
// `COLUMN_ENUMS.contractor_resolution`), never guessed. A permit with no resolution recorded is
// `unresolved` (the vendored view's own default, ADR-07). Render-only.
import type { ReactElement } from "react";
import { StatusPill, type StatusKind } from "@crm/ui";
import { contractorResolutionLabel } from "../../../format/index.js";

const STATUS: Readonly<Record<string, StatusKind>> = {
  resolved: "verified",
  unresolved: "unavailable",
};

export interface ContractorBadgeProps {
  readonly resolution: string | null;
}

export function ContractorBadge({ resolution }: ContractorBadgeProps): ReactElement {
  const state = resolution ?? "unresolved";
  return (
    <span data-contractor-resolution={state}>
      <StatusPill
        status={STATUS[state] ?? "unavailable"}
        text={`Contractor ${contractorResolutionLabel(state).toLowerCase()}`}
      />
    </span>
  );
}
