// B-09 UI fix (side-by-side audit 05-leads-1440 / 06-leads-390): the Leads list filters and list
// actions, rebuilt to prototype CrmLeads390/768/1440 and CRM-HANDOFF § 4.5 within what
// `leads.list` accepts (contracts/leads.md):
// - Status chips (New … Lost). The API takes one status, so one chip is on at a time (the board's
//   multi-select needs a list input the API does not have yet).
// - Assignee: Me (the API default) or an exact name, committed on Enter or leaving the box. There is no rep directory yet
//   (design-review-log row 17, `users.list`), so there is no Me / All reps menu; the hint says so.
// - Roof age ≥ Any / 15 / 20 / 25, Permit status Open / Stalled / Any (no Closed:
//   design-review-log row 6; the API takes one value, so Open and Stalled do not combine).
// - Permit open >= Any / 1 yr / 3 yrs / 5 yrs / 10 yrs (sent as days = ceil(years x 365.25)).
// - Within {radius preset} mi of {Area}: one select line (the area is Anywhere, a point or the
//   device location; the radius waits for an area). There is no place picker: the gazetteer is
//   not bundled into the web app.
// - Copy link (the URL already holds every filter) and Show on map (the map's own URL keys).
// Below 600 px the controls sit in a bottom sheet behind "Filters" with the active count.
import { Icon, IconButton } from "@crm/ui";
import { LEAD_STATUSES, type LeadStatus } from "@crm/shared";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import {
  PERMIT_OPEN_YEARS,
  PERMIT_STATUSES,
  RADIUS_PRESETS_MI,
  activeFilterCount,
  leadsMapHref,
  type LeadQuery,
  type LeadQueryPatch,
} from "./leadFilters.state.js";
import { COUNTY_NAME } from "../../components/AppShell/navigation.js";
import styles from "./LeadFilters.module.css";

export const STATUS_LABEL: Readonly<Record<LeadStatus, string>> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  won: "Won",
  lost: "Lost",
};

/** CRM-HANDOFF § 4.5: "Roof age ≥ (Any, 15, 20, 25)". */
export const LEAD_ROOF_AGE_CHIPS: readonly number[] = [15, 20, 25];

const PERMIT_LABEL = { open: "Open", stalled: "Stalled" } as const;

/** "1 yr", "3 yrs" (the Permit open >= chips and the sentence). */
export const permitOpenText = (years: number): string => `${years} ${years === 1 ? "yr" : "yrs"}`;

const CLEARED: LeadQueryPatch = {
  roof: null,
  permit: null,
  permitOpen: null,
  lat: null,
  lng: null,
  r: null,
  status: null,
  assignee: null,
};

function committedNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** One plain sentence for the active filters (§ 4.5), or null when none is on. */
export function filterSummary(query: LeadQuery): string | null {
  const parts = [
    query.status === undefined ? null : STATUS_LABEL[query.status],
    query.assignee === undefined ? null : `assigned to ${query.assignee}`,
    query.roofAgeMinYears === undefined ? null : `roof ≥ ${query.roofAgeMinYears} yrs`,
    query.permitStatus === undefined ? null : `${query.permitStatus} permit`,
    query.permitOpenYears === undefined
      ? null
      : `permit open ≥ ${permitOpenText(query.permitOpenYears)}`,
    query.center === null
      ? null
      : `within ${query.radiusMi} mi of ${query.center.lat.toFixed(4)}, ${query.center.lng.toFixed(4)}`,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: string;
}): ReactElement {
  return (
    <button
      type="button"
      className={`${styles.chip} ${pressed ? styles.chipSelected : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A number box that keeps what the person is typing ("30.") until they leave it, while every
 *  valid value is written to the URL straight away. */
function NumberField({
  id,
  label,
  value,
  onCommit,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: number | null) => void;
}): ReactElement {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="number"
        step="any"
        inputMode="decimal"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          onCommit(committedNumber(e.target.value));
        }}
        onBlur={() => setDraft(undefined)}
      />
    </div>
  );
}

function AssigneeField({
  id,
  value,
  onCommit,
}: {
  readonly id: string;
  readonly value: string | undefined;
  readonly onCommit: (value: string | null) => void;
}): ReactElement {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const commit = (): void => {
    if (draft === undefined) return;
    const next = draft.trim();
    if (next !== (value ?? "")) onCommit(next === "" ? null : next);
    setDraft(undefined);
  };
  return (
    <div className={styles.group}>
      <label className={styles.groupLabel} htmlFor={id}>
        Assignee
      </label>
      <div className={styles.groupBody}>
        <div className={styles.chips}>
          {/* "Me" is the list's default (the API scopes to the caller); "All reps" and a rep
              menu need a rep directory the API does not have (design-review-log row 17). */}
          <Chip pressed={value === undefined} onClick={() => onCommit(null)}>
            Me
          </Chip>
          <input
            id={id}
            className={`${styles.input} ${styles.nameInput}`}
            type="text"
            placeholder="A name…"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            value={draft ?? value ?? ""}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            onBlur={commit}
          />
        </div>
        <p id={`${id}-hint`} className={styles.hint}>
          Type the name exactly as it shows on a lead. A team list is not available yet.
        </p>
      </div>
    </div>
  );
}

const LOCATION_ERROR: Readonly<Record<number, string>> = {
  1: "Location permission was denied. Enter a point instead.",
  2: "Your location is not available right now. Enter a point instead.",
  3: "Finding your location took too long. Try again or enter a point.",
};

function AreaControls({
  id,
  query,
  params,
  onPatch,
}: {
  readonly id: string;
  readonly query: LeadQuery;
  readonly params: URLSearchParams;
  readonly onPatch: (patch: LeadQueryPatch) => void;
}): ReactElement {
  const [pointChosen, setPointChosen] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const isPoint = pointChosen || params.has("lat") || params.has("lng");
  const radiusOptions = RADIUS_PRESETS_MI.includes(query.radiusMi)
    ? RADIUS_PRESETS_MI
    : [...RADIUS_PRESETS_MI, query.radiusMi].sort((a, b) => a - b);
  const noArea = query.center === null;

  const useMyLocation = (): void => {
    const geo = typeof navigator === "undefined" ? undefined : navigator.geolocation;
    if (geo === undefined) {
      setLocating("This browser cannot share a location. Enter a point instead.");
      return;
    }
    setLocating("Finding your location…");
    geo.getCurrentPosition(
      (position) => {
        setLocating(null);
        setPointChosen(true);
        onPatch({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => setLocating(LOCATION_ERROR[error.code] ?? LOCATION_ERROR[2] ?? null),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className={styles.group} role="group" aria-labelledby={`${id}-within`}>
      <span id={`${id}-within`} className={styles.groupLabel}>
        Within
      </span>
      <div className={styles.groupBody}>
        <div className={styles.withinRow}>
          <div className={styles.field}>
            <label className={styles.srOnly} htmlFor={`${id}-radius`}>
              Radius, mi
            </label>
            <select
              id={`${id}-radius`}
              className={styles.select}
              value={String(query.radiusMi)}
              disabled={noArea}
              aria-describedby={noArea ? `${id}-hint` : undefined}
              onChange={(e) => onPatch({ r: committedNumber(e.target.value) })}
            >
              {radiusOptions.map((mi) => (
                <option key={mi} value={String(mi)}>
                  {`${mi} mi`}
                </option>
              ))}
            </select>
          </div>
          <span className={styles.unit}>of</span>
          <div className={styles.field}>
            <label className={styles.srOnly} htmlFor={`${id}-area`}>
              Area
            </label>
            <select
              id={`${id}-area`}
              className={styles.select}
              value={isPoint ? "point" : "anywhere"}
              onChange={(e) => {
                if (e.target.value === "point") {
                  setPointChosen(true);
                } else {
                  setPointChosen(false);
                  onPatch({ lat: null, lng: null, r: null });
                }
              }}
            >
              <option value="anywhere">Anywhere in {COUNTY_NAME}</option>
              <option value="point">A point (latitude, longitude)</option>
            </select>
          </div>
          <button type="button" className={styles.tool} onClick={useMyLocation}>
            <Icon name="my_location" size="medium" />
            Use my location
          </button>
        </div>
        {locating === null ? null : (
          <p className={styles.hint} role="status">
            {locating}
          </p>
        )}
        {isPoint ? (
          <div className={styles.row}>
            <NumberField
              id={`${id}-lat`}
              label="Center latitude"
              value={params.get("lat") ?? ""}
              onCommit={(lat) => onPatch({ lat })}
            />
            <NumberField
              id={`${id}-lng`}
              label="Center longitude"
              value={params.get("lng") ?? ""}
              onCommit={(lng) => onPatch({ lng })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Copy link and Show on map (board CrmLeads1440 page header). Copy link copies the current URL,
 *  which already holds every filter; Show on map opens the map on the same area. Icon-only below
 *  600 px (CrmLeads390), keeping the same accessible names. */
export function LeadActions({ query }: { readonly query: LeadQuery }): ReactElement {
  const location = useLocation();
  const [copyState, setCopyState] = useState<string | null>(null);
  const copyLink = (): void => {
    const href = `${window.location.origin}${location.pathname}${location.search}`;
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      setCopyState("Couldn't copy the link. Copy it from the address bar.");
      return;
    }
    clipboard.writeText(href).then(
      () => setCopyState("Link copied"),
      () => setCopyState("Couldn't copy the link. Copy it from the address bar."),
    );
  };
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.tool} aria-label="Copy link" onClick={copyLink}>
        <Icon name="link" size="medium" />
        <span className={styles.toolLabel}>Copy link</span>
      </button>
      <Link
        className={`${styles.tool} ${styles.toolTonal}`}
        to={leadsMapHref(query)}
        aria-label="Show on map"
      >
        <Icon name="map" size="medium" />
        <span className={styles.toolLabel}>Show on map</span>
      </Link>
      <span className={styles.note} role="status">
        {copyState ?? ""}
      </span>
    </div>
  );
}

/** The active filters as short chip texts, in the order of the sentence (board CrmLeadsPaged390). */
export function activeFilterChips(query: LeadQuery): readonly string[] {
  return [
    query.status === undefined ? null : STATUS_LABEL[query.status],
    query.assignee === undefined ? null : query.assignee,
    query.roofAgeMinYears === undefined ? null : `Roof ≥ ${query.roofAgeMinYears} yrs`,
    query.permitStatus === undefined ? null : `${PERMIT_LABEL[query.permitStatus]} permit`,
    query.permitOpenYears === undefined
      ? null
      : `Permit open ≥ ${permitOpenText(query.permitOpenYears)}`,
    query.center === null ? null : `Within ${query.radiusMi} mi`,
  ].filter((chip): chip is string => chip !== null);
}

export interface LeadFiltersProps {
  readonly query: LeadQuery;
  readonly params: URLSearchParams;
  readonly onPatch: (patch: LeadQueryPatch) => void;
  /** Matching leads, once known: the sheet's "Show n leads" button. */
  readonly totalCount: number | undefined;
  /** The page header (title, count, actions). Below 600 px it stays pinned with the chips. */
  readonly head: ReactNode;
  /** The list is empty because of these filters: the state card owns "Clear filters". */
  readonly noMatch?: boolean;
  /** No leads exist at all: there is nothing to filter, so the controls are not drawn. */
  readonly hidePanel?: boolean;
}

export function LeadFilters({
  query,
  params,
  onPatch,
  totalCount,
  head,
  noMatch = false,
  hidePanel = false,
}: LeadFiltersProps): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const count = activeFilterCount(query);

  const close = (): void => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const roofChips =
    query.roofAgeMinYears === undefined || LEAD_ROOF_AGE_CHIPS.includes(query.roofAgeMinYears)
      ? LEAD_ROOF_AGE_CHIPS
      : [...LEAD_ROOF_AGE_CHIPS, query.roofAgeMinYears].sort((a, b) => a - b);
  const showLabel =
    totalCount === undefined
      ? "Show leads"
      : `Show ${totalCount} ${totalCount === 1 ? "lead" : "leads"}`;
  const chips = activeFilterChips(query);

  return (
    <section className={styles.region} aria-label="Lead filters">
      <div className={styles.sticky}>
        {head}
        {hidePanel ? null : (
          <div className={styles.toolbar}>
            <button
              ref={toggleRef}
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={`${id}-panel`}
              aria-label={count === 0 ? "Filters" : `Filters, ${count} active`}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name="tune" size="medium" />
              Filters
              {count === 0 ? null : <span className={styles.badge}>{count}</span>}
            </button>
            {(chips.length === 0 ? ["All my leads"] : chips).map((chip) => (
              <button
                key={chip}
                type="button"
                className={styles.summaryChip}
                aria-label={`Change filter, ${chip}`}
                onClick={() => setOpen(true)}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>
      {hidePanel ? null : (
        <>
          {open ? <div className={styles.backdrop} onClick={close} aria-hidden="true" /> : null}
          <div
            ref={panelRef}
            id={`${id}-panel`}
            role={open ? "dialog" : undefined}
            aria-label={open ? "Filters" : undefined}
            aria-modal={open || undefined}
            className={`${styles.panel} ${open ? styles.open : ""}`}
          >
            <div className={styles.sheetHeader}>
              <h3 className={styles.sheetTitle}>Filters</h3>
              <IconButton icon="close" label="Close filters" onClick={close} />
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Status</span>
              <div className={styles.chips} role="group" aria-label="Lead status">
                {LEAD_STATUSES.map((status) => (
                  <Chip
                    key={status}
                    pressed={query.status === status}
                    onClick={() => onPatch({ status: query.status === status ? null : status })}
                  >
                    {STATUS_LABEL[status]}
                  </Chip>
                ))}
              </div>
            </div>
            <AssigneeField
              key={query.assignee ?? ""}
              id={`${id}-assignee`}
              value={query.assignee}
              onCommit={(assignee) => onPatch({ assignee })}
            />
            <div className={styles.group}>
              <span className={styles.groupLabel}>Roof age ≥</span>
              <div className={styles.chips} role="group" aria-label="Roof age threshold">
                <Chip
                  pressed={query.roofAgeMinYears === undefined}
                  onClick={() => onPatch({ roof: null })}
                >
                  Any
                </Chip>
                {roofChips.map((years) => (
                  <Chip
                    key={years}
                    pressed={query.roofAgeMinYears === years}
                    onClick={() =>
                      onPatch({ roof: query.roofAgeMinYears === years ? null : years })
                    }
                  >
                    {String(years)}
                  </Chip>
                ))}
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Permit status</span>
              <div className={styles.chips} role="group" aria-label="Permit status">
                {PERMIT_STATUSES.map((status) => (
                  <Chip
                    key={status}
                    pressed={query.permitStatus === status}
                    onClick={() =>
                      onPatch({ permit: query.permitStatus === status ? null : status })
                    }
                  >
                    {PERMIT_LABEL[status]}
                  </Chip>
                ))}
                <Chip
                  pressed={query.permitStatus === undefined}
                  onClick={() => onPatch({ permit: null })}
                >
                  Any
                </Chip>
              </div>
            </div>
            <div className={styles.group}>
              <span className={styles.groupLabel}>Permit open ≥</span>
              <div className={styles.chips} role="group" aria-label="Permit open at least">
                <Chip
                  pressed={query.permitOpenYears === undefined}
                  onClick={() => onPatch({ permitOpen: null })}
                >
                  Any
                </Chip>
                {PERMIT_OPEN_YEARS.map((years) => (
                  <Chip
                    key={years}
                    pressed={query.permitOpenYears === years}
                    onClick={() =>
                      onPatch({ permitOpen: query.permitOpenYears === years ? null : years })
                    }
                  >
                    {permitOpenText(years)}
                  </Chip>
                ))}
              </div>
            </div>
            <AreaControls id={id} query={query} params={params} onPatch={onPatch} />
            <p id={`${id}-hint`} className={styles.hint}>
              Filters combine. Status is one choice at a time; the radius applies once an area is
              chosen.
            </p>
            {count === 0 || noMatch ? null : (
              <div className={styles.wideFooter}>
                <button type="button" className={styles.clear} onClick={() => onPatch(CLEARED)}>
                  Clear filters
                </button>
              </div>
            )}
            <div className={styles.sheetFooter}>
              {count === 0 ? (
                <span />
              ) : (
                <button type="button" className={styles.clear} onClick={() => onPatch(CLEARED)}>
                  Reset
                </button>
              )}
              <button type="button" className={styles.done} onClick={close}>
                {showLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
