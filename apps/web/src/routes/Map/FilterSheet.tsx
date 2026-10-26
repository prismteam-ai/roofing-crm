// B-03 Map filter sheet (tasks.md T024; AC-3, AC-5, FR-003, FR-005). Replaces the A-13/ORACLE-u
// Explore version this file was copied from (C1 copy, 2026-10-23): that version controlled
// place/radius/roof/permit/openYrs/tenure/ooa/sort for Task A's place-based Explorer. This Map
// has no place search; it keeps the owner group of Task A's panel (tenure, out-of-area), applied
// by the server — radius itself lives in `RadiusControl.tsx` (Group 1's T016). CRM-HANDOFF
// §4.2 "Filters (CRM set)" names exactly three controls, and this file owns all three: the
// roof-age threshold (chips 10/13/15/20/25, or any number in "Other"; default 15 — one control,
// not two), the permit status (Open/Stalled/Any), and the permit-open-duration filter. Permit
// status/open-years are sent with the properties request and applied by the server to every
// property in range before it pages and counts ("Open" = open or stalled, "Stalled" = stalled
// only; a stalled permit is an open one that is not progressing). There is no separate "show permits"
// toggle in the CRM-HANDOFF filter set — the old A-13 "Show open permits" checkbox was left
// behind by the structural rebuild and has been removed as a duplicate of "Permit status".
// Below 1280 px the controls collapse into a real dismissible sheet behind a "Filters" button
// (aria-expanded; Escape and backdrop-click close it, matching `@crm/ui`'s `Popover`); from
// 1280 px they sit beside the results as an always-visible anchored panel (same breakpoint as the
// file this replaces). Atlas outlined text fields and chips, 48 px targets. Render-only.
import { Icon, IconButton } from "@crm/ui";
import { DEFAULT_ROOF_AGE_YEARS } from "@crm/domain";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { OUT_OF_AREA_UNPUBLISHED } from "./Candidates/candidates.js";
import {
  FILTER_PRESETS,
  MAX_TENURE_YEARS,
  presetMatches,
  type FilterPreset,
} from "./ExploreFilters.state.js";
import styles from "./FilterSheet.module.css";

/** The "Tenure > 10 yrs" chip sets this threshold: the filter is "N years or more", so "more than
 *  10 years" is 11 (tenure is whole years, and Task A's long-tenure rule is `tenure_years > 10`). */
export const TENURE_CHIP_YEARS = 11;

/** CRM-HANDOFF §4.2: "Roof age ≥ N (10–25 chips or any number in 'Other'; default 15)". */
export const ROOF_AGE_CHIPS: readonly number[] = [10, 13, 15, 20, 25];

export type PermitStatusFilter = "open" | "stalled" | "any";

/** CRM-HANDOFF §4.2: "Permit open ≥ any / 1 / 3 / 5 / 10 yrs". */
export const PERMIT_OPEN_YEARS_OPTIONS: readonly number[] = [1, 3, 5, 10];

export interface FilterSheetProps {
  /** `undefined` = no roof-age filter applied (every row shown, FR-003's "no filter" state). */
  readonly roofAgeMinYears: number | undefined;
  readonly onRoofAgeMinYearsChange: (value: number | undefined) => void;
  /** Permit status (Open · Stalled · Any — "Open" means not finaled, includes stalled per
   *  CRM-HANDOFF §4.2). The one permit-status control this sheet renders (there is no separate
   *  show/hide-permits toggle — "Any" already shows every permit). */
  readonly permitStatus: PermitStatusFilter;
  readonly onPermitStatusChange: (value: PermitStatusFilter) => void;
  /** Permit open ≥ N yrs; `undefined` = "Any". */
  readonly permitOpenYrs: number | undefined;
  readonly onPermitOpenYrsChange: (value: number | undefined) => void;
  /** Owner filter: tenure of at least N years; `undefined` = off. */
  readonly tenureYearsMin?: number | undefined;
  readonly onTenureYearsMinChange?: ((value: number | undefined) => void) | undefined;
  /** Owner filter: the owner's mailing ZIP is outside the county area. */
  readonly outOfArea?: boolean | undefined;
  readonly onOutOfAreaChange?: ((value: boolean) => void) | undefined;
  /** Shown in the match bar in place of a count when none can be given (for example the county
   *  overview, which owner filters do not reach). */
  readonly matchNote?: string | undefined;
  /** How many properties match the filters now (the chip on the phone toolbar's Filters button,
   *  boards CrmMapPin390 and CrmMap390); absent while there is no search to count. */
  readonly matchCount?: number | undefined;
  /** Controlled open state (the map's `mode=filters` opens the phone sheet). Absent = the sheet
   *  keeps its own state, as before. */
  readonly open?: boolean | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /** True where the panel is a permanent pane beside the map (a region, not a dialog). */
  readonly inline?: boolean | undefined;
  /** The pane's footer (board Explore1440, "128 properties match · Clear"): what the count covers
   *  ("within 5 mi of the pin", "county-wide") and the run it is read from ("Run 3"). */
  readonly matchScope?: string | undefined;
  readonly runLabel?: string | undefined;
  /** Applies a Suggestions preset in one update (roof, permit and owner filters together). The
   *  section is not shown without it. */
  readonly onApplyPreset?: ((preset: FilterPreset) => void) | undefined;
  /** Resets the filters: roof age back to the default (15), permit and owner filters off. */
  readonly onClear?: (() => void) | undefined;
}

/** "roof ≥ 13 · permit open · open 3+ yrs", or "none" when no filter is set. */
export function filterSummary(
  roofAgeMinYears: number | undefined,
  permitStatus: PermitStatusFilter,
  permitOpenYrs: number | undefined,
  tenureYearsMin?: number | undefined,
  outOfArea?: boolean | undefined,
): string {
  const parts = [
    roofAgeMinYears === undefined ? null : `roof ≥ ${String(roofAgeMinYears)}`,
    tenureYearsMin === undefined
      ? null
      : tenureYearsMin === TENURE_CHIP_YEARS
        ? `tenure > ${String(TENURE_CHIP_YEARS - 1)}`
        : `tenure ≥ ${String(tenureYearsMin)}`,
    outOfArea === true ? "out-of-area owner" : null,
    permitStatus === "any" ? null : `permit ${permitStatus}`,
    permitOpenYrs === undefined ? null : `open ${String(permitOpenYrs)}+ yrs`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? "none" : parts.join(" · ");
}

/** The URL/control value of typed text: an integer >= 0, or `undefined` for an empty box
 *  (data-model.md: "a property with roofAgeYears = null is never filtered out... until a
 *  threshold is applied" — an empty box means that same "no filter" state, not 0). */
export function committedRoofAge(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.round(n));
}

/** Typed tenure text -> a value for the URL: whole years 0-100, or `undefined` when the text is not
 *  one (a blank box is "off"; a value outside the range is never clamped into another question). */
export function committedTenure(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 && n <= MAX_TENURE_YEARS ? n : undefined;
}

export function FilterSheet({
  roofAgeMinYears,
  onRoofAgeMinYearsChange,
  permitStatus,
  onPermitStatusChange,
  permitOpenYrs,
  onPermitOpenYrsChange,
  tenureYearsMin,
  onTenureYearsMinChange,
  outOfArea = false,
  onOutOfAreaChange,
  matchNote,
  matchCount,
  open: controlledOpen,
  onOpenChange,
  inline = false,
  matchScope,
  runLabel,
  onClear,
  onApplyPreset,
}: FilterSheetProps): ReactElement {
  const id = useId();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean | ((current: boolean) => boolean)): void => {
    const value = typeof next === "function" ? next(open) : next;
    setOwnOpen(value);
    onOpenChange?.(value);
  };
  // What the person is typing, until they leave the box (mirrors the copied-from file's "drafts"
  // pattern so a half-typed value is never clobbered by the committed one re-rendering).
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [tenureDraft, setTenureDraft] = useState<string | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = (): void => setOpen(false);

  // aria-modal below 1280 px, so Tab must not leave the sheet: wrap from the last control to the
  // first and back (the same trap as the Candidates ConfirmSheet).
  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab" || !open || panelRef.current === null) return;
    const focusable = [
      ...panelRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled])",
      ),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === panelRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // The overlay is a dialog: focus moves into it when it opens and returns to the Filters button
  // when it closes (not for the always-visible panel at three-pane widths, which never takes focus).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (inline) return;
    if (open && !wasOpen.current) panelRef.current?.focus();
    if (!open && wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open, inline]);

  // Below 1280px the panel is a dismissible overlay: Escape closes it (same contract as
  // `@crm/ui`'s `Popover`), and so does a click on the backdrop rendered behind it. From 1280px
  // the panel is always visible beside the results (CSS below), so neither listener fires
  // anything a person can see.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className={styles.sheet}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.toggleIcon}>
          <Icon name="tune" size="medium" />
        </span>
        <span className={styles.toggleLabel}>Filters</span>
        {matchCount === undefined ? null : (
          <span className={styles.count} data-filter-count="">
            {matchCount.toLocaleString("en-US")}
          </span>
        )}
      </button>
      {open ? <div className={styles.backdrop} onClick={close} aria-hidden="true" /> : null}
      <div
        ref={panelRef}
        id={`${id}-panel`}
        role={inline ? "region" : "dialog"}
        aria-label="Filters"
        aria-modal={!inline && open ? true : undefined}
        tabIndex={-1}
        onKeyDown={inline ? undefined : trapTab}
        className={`${styles.panel} ${open ? styles.open : ""}`}
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>Filters</span>
          <IconButton
            icon="close"
            label="Close filters"
            className={styles.closeBtn}
            onClick={close}
          />
        </div>
        {/* CRM-HANDOFF §4.2: "Roof age ≥ N (10–25 chips or any number in 'Other')" — one
            control: the five preset chips, plus "Other" for any value the chips don't cover. */}
        <div className={styles.group}>
          <span className={styles.groupLabel}>Roof age ≥</span>
          <div className={styles.chips} role="group" aria-label="Roof age threshold">
            {/* "Any" is an explicit choice (URL `roof=any`), not the absence of one: with no `roof`
                param the map asks for roofs of DEFAULT_ROOF_AGE_YEARS or more. */}
            <button
              type="button"
              className={`${styles.chip} ${roofAgeMinYears === undefined ? styles.chipSelected : ""}`}
              aria-pressed={roofAgeMinYears === undefined}
              onClick={() => onRoofAgeMinYearsChange(undefined)}
            >
              Any
            </button>
            {ROOF_AGE_CHIPS.map((years) => (
              <button
                key={years}
                type="button"
                className={`${styles.chip} ${roofAgeMinYears === years ? styles.chipSelected : ""}`}
                aria-pressed={roofAgeMinYears === years}
                onClick={() => onRoofAgeMinYearsChange(years)}
              >
                {years}
              </button>
            ))}
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-roof`}>
              Other, yrs or older
            </label>
            <input
              id={`${id}-roof`}
              className={styles.input}
              type="number"
              inputMode="numeric"
              step="1"
              min={0}
              placeholder={`${DEFAULT_ROOF_AGE_YEARS}`}
              value={draft ?? (roofAgeMinYears === undefined ? "" : String(roofAgeMinYears))}
              onChange={(e) => {
                const typed = e.target.value;
                setDraft(typed);
                if (typed.trim() === "") {
                  onRoofAgeMinYearsChange(undefined);
                } else {
                  const committed = committedRoofAge(typed);
                  if (committed !== undefined) onRoofAgeMinYearsChange(committed);
                }
              }}
              onBlur={() => setDraft(undefined)}
            />
          </div>
        </div>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Permit status</span>
          <div className={styles.chips} role="group" aria-label="Permit status">
            {(["open", "stalled", "any"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={`${styles.chip} ${permitStatus === status ? styles.chipSelected : ""}`}
                aria-pressed={permitStatus === status}
                title={status === "open" ? "Open and stalled permits" : undefined}
                onClick={() => onPermitStatusChange(status)}
              >
                {status === "open" ? "Open" : status === "stalled" ? "Stalled" : "Any"}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${id}-open-yrs`}>
            Permit open ≥
          </label>
          <select
            id={`${id}-open-yrs`}
            className={styles.select}
            value={permitOpenYrs ?? ""}
            onChange={(e) =>
              onPermitOpenYrsChange(e.target.value === "" ? undefined : Number(e.target.value))
            }
          >
            <option value="">Any</option>
            {PERMIT_OPEN_YEARS_OPTIONS.map((years) => (
              <option key={years} value={years}>
                {years} yrs
              </option>
            ))}
          </select>
        </div>
        <div className={styles.group}>
          <span className={styles.groupLabel}>Owner</span>
          <div className={styles.chips} role="group" aria-label="Owner">
            <button
              type="button"
              className={`${styles.chip} ${styles.chipWithIcon} ${tenureYearsMin === TENURE_CHIP_YEARS ? styles.chipSelected : ""}`}
              aria-pressed={tenureYearsMin === TENURE_CHIP_YEARS}
              onClick={() =>
                onTenureYearsMinChange?.(
                  tenureYearsMin === TENURE_CHIP_YEARS ? undefined : TENURE_CHIP_YEARS,
                )
              }
            >
              {tenureYearsMin === TENURE_CHIP_YEARS ? <Icon name="check" size="small" /> : null}
              Tenure &gt; 10 yrs
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipWithIcon} ${outOfArea ? styles.chipSelected : ""}`}
              aria-pressed={outOfArea}
              onClick={() => onOutOfAreaChange?.(!outOfArea)}
            >
              <Icon name={outOfArea ? "check" : "add"} size="small" />
              Out-of-area
            </button>
          </div>
          {outOfArea ? (
            <p className={styles.hint} data-out-of-area-hint="">
              {OUT_OF_AREA_UNPUBLISHED}
            </p>
          ) : null}
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${id}-tenure`}>
              Tenure, yrs or more (&gt;)
            </label>
            <input
              id={`${id}-tenure`}
              className={styles.input}
              type="number"
              inputMode="numeric"
              step="1"
              min={0}
              max={MAX_TENURE_YEARS}
              placeholder={`${TENURE_CHIP_YEARS}`}
              value={tenureDraft ?? (tenureYearsMin === undefined ? "" : String(tenureYearsMin))}
              onChange={(e) => {
                const typed = e.target.value;
                setTenureDraft(typed);
                if (typed.trim() === "") onTenureYearsMinChange?.(undefined);
                else {
                  const committed = committedTenure(typed);
                  if (committed !== undefined) onTenureYearsMinChange?.(committed);
                }
              }}
              onBlur={() => setTenureDraft(undefined)}
            />
          </div>
          <p className={styles.hint}>
            Tenure: years since the latest dated sale on record; properties without one are left out
            and counted.
          </p>
          <p className={styles.hint}>
            Out-of-area owner: the owner&apos;s mailing ZIP is outside the Travis County area
            (owner_area_class).
          </p>
        </div>
        {onApplyPreset === undefined ? null : (
          <div className={styles.group} data-filter-suggestions="">
            <span className={styles.groupLabel} id={`${id}-suggestions`}>
              Suggestions
            </span>
            <div className={styles.presets} role="group" aria-labelledby={`${id}-suggestions`}>
              {FILTER_PRESETS.map((preset) => {
                const pressed = presetMatches(preset, {
                  roofAgeMinYears,
                  permitStatus,
                  permitOpenYrs,
                  tenureYearsMin,
                  outOfArea,
                });
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`${styles.chip} ${styles.presetChip} ${pressed ? styles.chipSelected : ""}`}
                    aria-pressed={pressed}
                    data-preset={preset.id}
                    onClick={() => onApplyPreset(preset)}
                  >
                    {pressed ? <Icon name="check" size="small" /> : null}
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {inline && (matchCount !== undefined || matchNote !== undefined) ? (
          <div className={styles.matchBar} data-match-bar="">
            <div className={styles.matchRow}>
              <span className={styles.matchText} aria-live="polite">
                {matchCount === undefined ? (
                  matchNote
                ) : (
                  <>
                    <strong data-match-total="">{matchCount.toLocaleString("en-US")}</strong>
                    {matchCount === 1 ? " property matches" : " properties match"}
                    {matchScope === undefined ? "" : ` ${matchScope}`}
                  </>
                )}
              </span>
              {onClear === undefined ? null : (
                <button
                  type="button"
                  className={styles.clearBtn}
                  disabled={
                    roofAgeMinYears === DEFAULT_ROOF_AGE_YEARS &&
                    permitStatus === "any" &&
                    permitOpenYrs === undefined &&
                    tenureYearsMin === undefined &&
                    !outOfArea
                  }
                  onClick={onClear}
                >
                  Clear
                </button>
              )}
            </div>
            <p className={styles.matchSummary}>
              {`Filters: ${filterSummary(roofAgeMinYears, permitStatus, permitOpenYrs, tenureYearsMin, outOfArea)}${runLabel === undefined ? "" : ` · ${runLabel}`}`}
            </p>
          </div>
        ) : null}
        <div className={styles.footer}>
          <button type="button" className={styles.showResults} onClick={close}>
            {matchCount === undefined
              ? "Show results"
              : `Show ${matchCount.toLocaleString("en-US")} ${matchCount === 1 ? "result" : "results"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
