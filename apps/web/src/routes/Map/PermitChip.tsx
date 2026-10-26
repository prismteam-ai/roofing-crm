// B-03 permit chip (tasks.md T029; AC-5, FR-005). Replaces the A-13/ORACLE-u version this file
// was copied from (C1 copy, 2026-10-23): that file read `ExplorePermit`'s `open_years`/
// `status_class` plus a source-text lookup (`@countylens/shared`'s EXPLORE_TEXTS) that doesn't
// exist in this repo. This version reads this story's own `CrmPermit` fields (`openDays`,
// `statusClass`) verbatim and renders the long-open badge from `packages/domain`'s `isLongOpen`
// (data-model.md: "a display-layer flag... never recomputed from issueDate") — it never
// recomputes the badge itself. `data-permit-chip` carries the status class, `data-open-days` the
// exact value, `data-long-open` whether the badge fired — the real assertions B-03-TC-016/017/018
// read. Render-only.
import { isLongOpen } from "@crm/domain";
import { StatusPill } from "@crm/ui";
import type { CrmPermit, Missing } from "@crm/index-schema";
import type { ReactElement } from "react";
import {
  finaledPermitLabel,
  openDurationText,
  permitStatusShortLabel,
} from "../../format/index.js";

export interface PermitChipProps {
  readonly permit: Pick<CrmPermit, "openDays" | "statusClass" | "permitNumber"> &
    Partial<Pick<CrmPermit, "finalDate">> & {
      /** The permit's `missing` entries: the reason an empty open duration shows. */
      readonly missingReasons?: readonly Missing[];
    };
}

export function PermitChip({ permit }: PermitChipProps): ReactElement {
  const finaled = finaledPermitLabel(permit.statusClass, permit.finalDate);
  if (finaled !== null) {
    // Finished: no open duration is shown, and the class is not trusted as "stalled".
    return (
      <span data-permit-chip="finaled" data-open-days="" data-long-open={false}>
        <StatusPill status="verified" text={finaled} />
      </span>
    );
  }
  const longOpen = isLongOpen(permit.openDays);
  const label = openDurationText(permit);
  const statusLabel = permitStatusShortLabel(permit.statusClass, permit.finalDate);
  return (
    <span
      data-permit-chip={permit.statusClass ?? ""}
      data-open-days={permit.openDays ?? ""}
      data-long-open={longOpen}
    >
      <StatusPill
        status={longOpen ? "warning" : permit.openDays === null ? "unavailable" : "info"}
        text={`${statusLabel} · ${label}`}
      />
      {longOpen ? <StatusPill status="warning" text="Long-open" icon="schedule" /> : null}
    </span>
  );
}
