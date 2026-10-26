// B-07 T026 / B-09 board match (CrmLeadCreate390/768/1440, CrmLeadDup390/1440, E-74, E-77):
// "Create lead" is one tap, no form (AC-1, AC-2, FR-001). Calls `leads.create` through leadsApi
// and answers with a snackbar: "Lead created" with Open lead and an optional note (Skip / Save
// note). An `ALREADY_EXISTS` error (the dedupe on {fips}:tcad:{request_identifier}, ADR-04) is
// shown as "Already a lead", never as a failure. Undo calls `leads.undoCreate` with the leadId the
// create returned; a refusal is shown as the reason the lead was kept. The snackbar renders inside this component's own
// subtree (position fixed), so it stays with the drawer or permit row that made the lead.
import { leadKey as leadKeyOf } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { contractorSnapshot, isLivePermit, mainLeadPermit } from "@crm/shared";
import { Icon, StatusPill } from "@crm/ui";
import { useState, type ReactElement } from "react";
import { Link } from "react-router";
import { propertyTitle } from "../../format/index.js";
import { useUndoCreateLead } from "../Map/Candidates/candidatesApi.js";
import { undoOneText, type UndoAnswer } from "../Map/Candidates/undoCopy.js";
import { LeadBanner } from "./LeadBanner.js";
import {
  useAddLeadNote,
  useCreateLead,
  useLeadPresence,
  type LeadCreateInput,
} from "./leadsApi.js";
import { STATUS_LABEL } from "./LeadFilters.js";
import styles from "./Leads.module.css";

/** Travis County, TX (the only county this CRM serves); part of the lead dedupe key. */
export const TRAVIS_FIPS = "48453";

export function isAlreadyExists(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  // `data.appCode` is set by the API's errorFormatter (tRPC does not send `cause` over the wire).
  const data = (error as { data?: { appCode?: unknown } }).data;
  return data?.appCode === "ALREADY_EXISTS";
}

/** Builds the `leads.create` input from the drawer's property. This contract publishes no street
 *  address (FU-A-01), so the lead is labelled by its TCAD id, never a fabricated address. The
 *  snapshot holds the given permit, else the property's first open one (AC-1). The contractor is
 *  the name exactly as the permit prints it (unverified) plus Task A's BBB state; none is invented. */
export function toCreateInput(
  property: Provenanced<CrmProperty>,
  permits: readonly Provenanced<CrmPermit>[] = [],
  permit?: Provenanced<CrmPermit>,
): LeadCreateInput | null {
  if (property.latitude === null || property.longitude === null) return null;
  // The same rule as the agent path and the Candidate list: the open or stalled permit open longest.
  const snapshotPermit = permit ?? mainLeadPermit(permits);
  return {
    fips: TRAVIS_FIPS,
    requestIdentifier: property.requestIdentifier,
    address: propertyTitle(property),
    lat: property.latitude,
    lon: property.longitude,
    signals: {
      ...(property.roofAgeYears === null ? {} : { roofAgeYears: property.roofAgeYears }),
      roofAgeBasis: property.roofAgeBasis,
      roofAgeConfidence: property.roofAgeConfidence,
      ...(snapshotPermit?.permitNumber == null
        ? {}
        : { openPermitId: snapshotPermit.permitNumber }),
      ...(snapshotPermit?.openDays == null ? {} : { openDays: snapshotPermit.openDays }),
      ...(snapshotPermit !== null && snapshotPermit !== undefined && isLivePermit(snapshotPermit)
        ? { openPermitStatus: snapshotPermit.statusClass === "stalled" ? "stalled" : "open" }
        : {}),
      ...contractorSnapshot(snapshotPermit),
    },
    sourceManifestCid: property.sourceManifestCid,
    createdFrom: "map",
  };
}

/** The words for a failed create: offline is its own sentence (CrmPropertyFailed390). */
function failureText(): string {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "You're offline. The lead was not saved."
    : "Couldn't create the lead. Nothing was saved. Try again.";
}

function Snackbar({
  headline,
  leadHref,
  note,
  undo,
  onDismiss,
}: {
  readonly headline: string;
  readonly leadHref: string;
  /** Present only for a lead that was just created: the optional first note. */
  readonly note?: { readonly leadKey: string } | undefined;
  /** Present only for a lead that was just created: Undo removes it (`leads.undoCreate`). */
  readonly undo?:
    | {
        readonly leadKey: string;
        readonly leadId: string;
        readonly onDone: (answer: UndoAnswer | "failed") => void;
        /** Why the server kept the lead, once it refused. */
        readonly kept: string | null;
      }
    | undefined;
  readonly onDismiss: () => void;
}): ReactElement {
  const addNote = useAddLeadNote();
  const undoCreate = useUndoCreateLead();
  const [noteOpen, setNoteOpen] = useState(note !== undefined);
  const [text, setText] = useState("");
  const saveNote = (): void => {
    const trimmed = text.trim();
    if (note === undefined || trimmed === "") return;
    addNote.mutate(
      { leadKey: note.leadKey, text: trimmed },
      { onSuccess: () => setNoteOpen(false) },
    );
  };
  return (
    <div className={styles.snackbar} role="status" data-snackbar="">
      <div className={styles.snackbarRow}>
        <Icon name={note === undefined ? "description" : "check_circle"} size="medium" />
        <p className={styles.snackbarText}>{headline}</p>
        {undo === undefined ? null : (
          <button
            type="button"
            className={styles.snackbarAction}
            disabled={undoCreate.isPending || undo.kept !== null}
            onClick={() =>
              undoCreate.mutate(
                { leadKey: undo.leadKey, leadId: undo.leadId },
                {
                  onSuccess: (answer) => undo.onDone(answer),
                  onError: () => undo.onDone("failed"),
                },
              )
            }
          >
            {undoCreate.isPending ? "Undoing…" : "Undo"}
          </button>
        )}
        <Link className={styles.snackbarAction} to={leadHref}>
          Open lead
        </Link>
        <Link className={styles.snackbarAction} to="/leads">
          View leads
        </Link>
        <button
          type="button"
          className={styles.snackbarClose}
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <Icon name="close" size="medium" />
        </button>
      </div>
      {undo?.kept == null ? null : <p className={styles.snackbarSaved}>{undo.kept}</p>}
      {note === undefined ? null : noteOpen ? (
        <div className={styles.snackbarNote}>
          <label htmlFor="snackbar-note" className={styles.snackbarLabel}>
            Add a note (optional)
          </label>
          <textarea
            id="snackbar-note"
            className={styles.snackbarField}
            placeholder="For example: owner mails from Houston"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {addNote.error === null || addNote.error === undefined ? null : (
            <span className={styles.snackbarError}>Couldn't save the note. Try again.</span>
          )}
          <div className={styles.snackbarButtons}>
            <button
              type="button"
              className={styles.snackbarAction}
              onClick={() => setNoteOpen(false)}
            >
              Skip
            </button>
            <button
              type="button"
              className={styles.snackbarAction}
              disabled={addNote.isPending || text.trim() === ""}
              onClick={saveNote}
            >
              Save note
            </button>
          </div>
        </div>
      ) : addNote.isSuccess ? (
        <p className={styles.snackbarSaved}>Note saved.</p>
      ) : null}
    </div>
  );
}

export function LeadCreateAction({
  property,
  permits = [],
  permit,
}: {
  readonly property: Provenanced<CrmProperty>;
  /** The drawer's permits (the snapshot takes the first open one). */
  readonly permits?: readonly Provenanced<CrmPermit>[];
  /** Set on a permit row's button: the snapshot holds this permit. The lead is still per property. */
  readonly permit?: Provenanced<CrmPermit>;
}): ReactElement | null {
  const create = useCreateLead();
  const presence = useLeadPresence(property.requestIdentifier, TRAVIS_FIPS);
  const [dismissed, setDismissed] = useState(false);
  /** What Undo answered: the lead was removed, or why it was kept. */
  const [removed, setRemoved] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const input = toCreateInput(property, permits, permit);

  if (input === null) {
    // The header action already says so; a permit row stays quiet.
    if (permit !== undefined) return null;
    return (
      <p className={styles.meta}>
        Create lead unavailable: this property has no published location.
      </p>
    );
  }
  const key = leadKeyOf(input.fips, input.requestIdentifier);
  const leadHref = `/leads/${encodeURIComponent(create.data?.leadKey ?? key)}`;

  if (create.isSuccess) {
    return (
      <div className={styles.createState}>
        <StatusPill status="info" text="Lead · New" icon="description" />
        {dismissed ? null : (
          <Snackbar
            headline="Lead created · New · assigned to you"
            leadHref={leadHref}
            note={{ leadKey: create.data?.leadKey ?? key }}
            undo={
              create.data === undefined
                ? undefined
                : {
                    leadKey: create.data.leadKey,
                    leadId: create.data.leadId,
                    kept,
                    onDone: (answer) => {
                      if (answer !== "failed" && answer.deleted) {
                        setRemoved(undoOneText(answer));
                        setKept(null);
                        setDismissed(false);
                        create.reset();
                      } else {
                        setKept(undoOneText(answer));
                      }
                    },
                  }
            }
            onDismiss={() => setDismissed(true)}
          />
        )}
      </div>
    );
  }
  if (isAlreadyExists(create.error)) {
    return (
      <div className={styles.createState}>
        <StatusPill status="info" text="Already a lead" icon="description" />
        {dismissed ? null : (
          <Snackbar
            headline="Already a lead. Nothing was added."
            leadHref={`/leads/${encodeURIComponent(key)}`}
            onDismiss={() => setDismissed(true)}
          />
        )}
      </div>
    );
  }
  // After a reload the drawer does not yet know whether this property is already a lead: until the
  // presence lookup has resolved it shows a neutral, disabled state (never an actionable Create
  // button that would turn into "Already a lead" a moment later).
  if (presence.isPending) {
    return (
      <div className={styles.createState}>
        <button type="button" className={styles.action} disabled aria-busy="true">
          Checking Leads…
        </button>
      </div>
    );
  }
  const existing = presence.data;
  if (existing !== null && existing !== undefined) {
    // The header says it; a permit row stays quiet.
    if (permit !== undefined) return null;
    return (
      <div className={styles.createState}>
        <StatusPill
          status="info"
          text={`Already a lead · ${STATUS_LABEL[existing.status]}`}
          icon="description"
        />
        <Link className={styles.actionLink} to={`/leads/${encodeURIComponent(existing.leadKey)}`}>
          Open lead
        </Link>
      </div>
    );
  }
  return (
    <div className={styles.createState}>
      {removed === null ? null : (
        <div className={styles.snackbar} role="status" data-snackbar="">
          <div className={styles.snackbarRow}>
            <Icon name="delete" size="medium" />
            <p className={styles.snackbarText}>{removed}</p>
            <button
              type="button"
              className={styles.snackbarClose}
              aria-label="Dismiss"
              onClick={() => setRemoved(null)}
            >
              <Icon name="close" size="medium" />
            </button>
          </div>
        </div>
      )}
      {create.error === null || create.error === undefined ? null : (
        <LeadBanner kind="error" icon="error" headline={failureText()} />
      )}
      <button
        type="button"
        className={styles.action}
        aria-label={
          permit === undefined
            ? undefined
            : `Create lead from permit ${permit.permitNumber ?? "(number not published)"}`
        }
        aria-busy={create.isPending}
        disabled={create.isPending}
        onClick={() => create.mutate(input)}
      >
        {create.isPending
          ? "Creating…"
          : permit === undefined
            ? "Create lead"
            : "Create lead from permit"}
      </button>
    </div>
  );
}
