/**
 * Honest placeholder for a deferred CRM sheet (Inbox, Reports, Campaigns).
 *
 * Teases the job that will land here. Stays disabled. Never fakes a workspace.
 */
import type { JSX } from "react";

import {
  PLAT_DEFERRED_COMING_LABEL,
  type DisabledCrmNavSection,
} from "./disabled-crm-nav-sections";

/**
 * Props for a deferred plat-sheet placeholder.
 */
export interface PlatDeferredFeaturePanelProps {
  section: DisabledCrmNavSection;
}

/**
 * Tease, honest now, and a Coming stamp that is not a working control.
 */
export function PlatDeferredFeaturePanel({
  section,
}: PlatDeferredFeaturePanelProps): JSX.Element {
  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`plat-deferred-sheet-${section.id}`}
    >
      <p className="text-sm text-foreground">{section.teaseCopy}</p>
      <p className="text-sm text-muted-foreground" role="status">
        {section.nowCopy}
      </p>
      <img
        src="/plat/stamp-coming.png"
        alt={`${section.label} is ${PLAT_DEFERRED_COMING_LABEL.toLowerCase()}`}
        width={96}
        height={96}
        className="mx-auto mt-10 mb-8 size-24 object-contain mix-blend-multiply rotate-[8deg]"
        data-testid={`plat-deferred-sheet-${section.id}-action`}
      />
    </div>
  );
}
