/**
 * LeadRecord list panel — outreach rows loaded from leads.list.
 *
 * Empty is valid until the user converts a property. Rows lead with the address
 * snapshot; leadId stays in the row (screen-reader + data attribute) so a reload can prove API persistence.
 * Archive is a soft-delete (leads.archive) so a mistaken Convert can be undone.
 */
import { useState, type ChangeEvent, type JSX, type MouseEvent } from "react";
import { LEAD_STATUSES, type LeadRecord } from "@roofing-crm-challenge/shared";

import { Button } from "@/components/ui/button";
import type { LeadRecordManageableStatus } from "./lead-record-api-client";

/**
 * Status values the list may set through leads.update (archive uses leads.archive).
 */
export const LEAD_RECORD_MANAGEABLE_STATUSES = LEAD_STATUSES.filter(
  (status): status is LeadRecordManageableStatus => status !== "archived",
);

/**
 * Copy when leads.list returns no active LeadRecords.
 */
export const LEAD_RECORD_LIST_EMPTY_COPY =
  "No leads yet. Open a property you'd like to work on and save it as a lead.";

/**
 * Copy when the leads list is held in browser memory until refresh.
 */
export const LEADS_LIST_PERSISTENCE_LOCAL_MEMORY_COPY =
  "Your leads list lasts until you refresh this tab.";

/**
 * Copy when the leads list is held in the local API until it restarts.
 */
export const LEADS_LIST_PERSISTENCE_LOCAL_API_COPY =
  "Your leads list lasts until the local API restarts.";

/**
 * Human label for a manageable LeadRecord status in the list control.
 */
function formatLeadRecordManageableStatusLabel(
  status: LeadRecordManageableStatus,
): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Props for the LeadRecord list panel.
 */
export interface LeadRecordListPanelProps {
  leadRecords: LeadRecord[];
  leadRecordListStatusMessage: string | null;
  onLeadRecordSelect?: (propertyId: string) => void;
  onUpdateLeadRecord?: (leadId: string, status: LeadRecordManageableStatus) => void;
  updateLeadRecordPendingLeadId?: string | null;
  onArchiveLeadRecord?: (leadId: string) => void;
  archiveLeadRecordPendingLeadId?: string | null;
}

/**
 * Renders active LeadRecords from the API (or an honest empty state).
 */
export function LeadRecordListPanel({
  leadRecords,
  leadRecordListStatusMessage,
  onLeadRecordSelect,
  onUpdateLeadRecord,
  updateLeadRecordPendingLeadId = null,
  onArchiveLeadRecord,
  archiveLeadRecordPendingLeadId = null,
}: LeadRecordListPanelProps): JSX.Element {
  const [armedArchiveLeadId, setArmedArchiveLeadId] = useState<string | null>(null);

  return (
    <section
      className="flex flex-col gap-2"
      aria-label="Leads list"
      data-testid="lead-record-list-panel"
    >
      {leadRecordListStatusMessage !== null ? (
        <p
          className="text-sm text-muted-foreground"
          role="status"
          data-testid="lead-record-list-status"
        >
          {leadRecordListStatusMessage}
        </p>
      ) : null}

      {leadRecords.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="lead-record-list-empty"
        >
          {LEAD_RECORD_LIST_EMPTY_COPY}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="lead-record-list">
          {leadRecords.map((leadRecord) => {
            const archiveArmed = armedArchiveLeadId === leadRecord.leadId;
            const archivePending = archiveLeadRecordPendingLeadId === leadRecord.leadId;
            const statusUpdatePending =
              updateLeadRecordPendingLeadId === leadRecord.leadId;
            const leadRecordActionsDisabled =
              archivePending ||
              statusUpdatePending ||
              archiveLeadRecordPendingLeadId !== null ||
              updateLeadRecordPendingLeadId !== null;
            const showStatusControl =
              onUpdateLeadRecord !== undefined && leadRecord.status !== "archived";
            return (
              <li key={leadRecord.leadId}>
                <div
                  className="flex items-start gap-2 rounded-lg border border-border bg-card p-2"
                  data-testid={`lead-record-row-${leadRecord.propertyId}`}
                  data-lead-id={leadRecord.leadId}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md text-left hover:bg-muted/60"
                    data-testid={`lead-record-select-${leadRecord.propertyId}`}
                    onClick={() => {
                      onLeadRecordSelect?.(leadRecord.propertyId);
                    }}
                  >
                    <span className="text-sm font-medium">
                      {leadRecord.addressSnapshot}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Score {String(leadRecord.leadScore)}
                      {leadRecord.provenanceTier === "synthetic_demo"
                        ? " · Synthetic demo"
                        : " · Sourced"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {leadRecord.propertyId}
                    </span>
                    <span className="sr-only">{leadRecord.leadId}</span>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {showStatusControl ? (
                      <label
                        className="flex flex-col gap-0.5 text-xs text-muted-foreground"
                        data-testid={`lead-record-status-label-${leadRecord.propertyId}`}
                      >
                        <span className="sr-only">Lead status</span>
                        <select
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                          data-testid={`lead-record-status-${leadRecord.propertyId}`}
                          aria-label={`Status for ${leadRecord.addressSnapshot}`}
                          value={leadRecord.status}
                          disabled={leadRecordActionsDisabled}
                          onClick={(event: MouseEvent<HTMLSelectElement>) => {
                            event.stopPropagation();
                          }}
                          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                            event.stopPropagation();
                            const nextStatus = event.target
                              .value as LeadRecordManageableStatus;
                            if (nextStatus === leadRecord.status) {
                              return;
                            }
                            onUpdateLeadRecord(leadRecord.leadId, nextStatus);
                          }}
                        >
                          {LEAD_RECORD_MANAGEABLE_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatLeadRecordManageableStatusLabel(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {onArchiveLeadRecord !== undefined ? (
                      archiveArmed ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="destructive"
                            size="xs"
                            data-testid={`confirm-archive-lead-record-${leadRecord.propertyId}`}
                            disabled={archivePending}
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              onArchiveLeadRecord(leadRecord.leadId);
                              setArmedArchiveLeadId(null);
                            }}
                          >
                            {archivePending ? "Archiving…" : "Confirm"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            data-testid={`cancel-archive-lead-record-${leadRecord.propertyId}`}
                            disabled={archivePending}
                            onClick={(event: MouseEvent<HTMLButtonElement>) => {
                              event.stopPropagation();
                              setArmedArchiveLeadId(null);
                            }}
                          >
                            Keep
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="shrink-0 border-foreground/45 bg-background/90 text-foreground hover:bg-muted"
                          data-testid={`archive-lead-record-${leadRecord.propertyId}`}
                          disabled={leadRecordActionsDisabled}
                          onClick={(event: MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation();
                            setArmedArchiveLeadId(leadRecord.leadId);
                          }}
                        >
                          Archive
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
