// Map search box: an accessible combobox (WAI-ARIA 1.2 list autocomplete, focus stays in the input,
// options are reached with aria-activedescendant). Places and ZIPs come from the vendored Travis
// gazetteer; a permit number or TCAD account is looked up by the API when chosen (lazily, so
// nothing is requested while typing); a street address is looked up after a short pause in typing
// and its matches are listed as options.
// The empty box lists Recent searches, Saved searches and the "Try" samples; Recent and Saved are
// kept in this browser only (recentSearches.ts).
import { Icon } from "@crm/ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import {
  MAX_SAVED,
  clearRecent,
  defaultSavedName,
  loadRecent,
  loadSaved,
  pushRecent,
  pushSaved,
  recentToOption,
  removeRecent,
  removeSaved,
  savedId,
  toRecent,
  viewDetail,
  type MapView,
  type RecentSearch,
  type SavedSearch,
} from "./recentSearches.js";
import {
  GAZETTEER_PROVENANCE,
  SEARCH_SAMPLES,
  addressOptions,
  classifyQuery,
  optionsFor,
  type AddressLookupResult,
  type SearchOption,
} from "./searchSuggest.js";
import { runLabel } from "./whyLead.js";
import styles from "./SearchBox.module.css";

export type ExactLookupResult =
  | {
      readonly found: true;
      readonly propertyCid: string;
      readonly lat: number;
      readonly lng: number;
    }
  | { readonly found: false; readonly runId: string | null };

export type { AddressLookupResult };

/** Pause after the last keystroke before a typed street address is sent to the API. */
export const ADDRESS_DEBOUNCE_MS = 250;

export interface SearchBoxProps {
  /** A place or ZIP was chosen: centre the radius search there. */
  readonly onCentre: (point: { lat: number; lng: number }) => void;
  /** A permit or TCAD lookup found its property: open it and centre on it. */
  readonly onOpenProperty: (propertyCid: string, point: { lat: number; lng: number }) => void;
  /** Exact lookup through the API; only called when a permit/TCAD option is chosen. */
  readonly lookup: (kind: "permit" | "tcad", value: string) => Promise<ExactLookupResult>;
  /** Exact street-address lookup through the API; called after a short pause in typing. */
  readonly lookupAddress: (value: string) => Promise<AddressLookupResult>;
  /** The Map's current centre, radius and roof filter (from the URL); null while there is no
   *  centre, which disables "Save this search". */
  readonly current?: MapView | null;
  /** A saved search was chosen: put its centre, radius and roof filter back in the URL. */
  readonly onApplySaved?: (view: MapView) => void;
}

type Group = "recent" | "saved" | "try";

interface Row {
  readonly option: SearchOption;
  /** Chosen from the empty-box lists: the text box takes the value (samples, recent). */
  readonly sample: boolean;
  readonly group?: Group;
  readonly saved?: SavedSearch;
}

const GROUP_TITLE: Record<Group, string> = { recent: "Recent", saved: "Saved", try: "Try" };
const NOTE_LOCAL = "Recent and saved stay in this browser.";
const PROVENANCE_EXACT = "Exact match against the current run index";
const PROVENANCE_SAMPLES = `Places and ZIPs: ${GAZETTEER_PROVENANCE}. Permits, accounts and street addresses: current run index.`;

const samePoint = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): boolean =>
  Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;

export function SearchBox({
  onCentre,
  onOpenProperty,
  lookup,
  lookupAddress,
  current = null,
  onApplySaved,
}: SearchBoxProps): ReactElement {
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>(loadRecent);
  const [saved, setSaved] = useState<SavedSearch[]>(loadSaved);
  // The last place or ZIP chosen here: names a saved search while the centre is still that place.
  const [lastPlace, setLastPlace] = useState<{ label: string; lat: number; lng: number } | null>(
    null,
  );

  const empty = text.trim() === "";
  const typed = text.trim().replace(/\s+/g, " ");
  const kind = empty ? "empty" : classifyQuery(text);
  // The latest street-address answer; only used while it is for the text now in the box.
  const [addressAnswer, setAddressAnswer] = useState<{
    readonly query: string;
    readonly result: AddressLookupResult | "failed";
  } | null>(null);

  useEffect(() => {
    if (kind !== "address") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      lookupAddress(typed).then(
        (result) => {
          if (!cancelled) setAddressAnswer({ query: typed, result });
        },
        () => {
          if (!cancelled) setAddressAnswer({ query: typed, result: "failed" });
        },
      );
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, typed, lookupAddress]);

  const answer = kind === "address" && addressAnswer?.query === typed ? addressAnswer.result : null;
  const fromAddress =
    answer === null || answer === "failed"
      ? { options: [] as SearchOption[], note: null }
      : addressOptions(answer, runLabel);
  const addressNote =
    kind !== "address"
      ? null
      : answer === null
        ? "Looking up the address…"
        : answer === "failed"
          ? "The address lookup failed. Check your connection and try again."
          : fromAddress.note;
  const rows: Row[] = empty
    ? [
        ...recent.map((r) => ({
          option: recentToOption(r),
          sample: true,
          group: "recent" as const,
        })),
        ...saved.map((s) => ({
          option: {
            id: `saved-${s.id}`,
            kind: "place" as const,
            label: s.name,
            detail: viewDetail(s),
          },
          sample: true,
          group: "saved" as const,
          saved: s,
        })),
        ...SEARCH_SAMPLES.flatMap((s) =>
          optionsFor(s.query).map((option) => ({
            option: { ...option, label: s.label },
            sample: true,
            group: "try" as const,
          })),
        ),
      ]
    : (kind === "address" ? fromAddress.options : optionsFor(text)).map((option) => ({
        option,
        sample: false,
      }));
  const showNoMatch = !empty && rows.length === 0 && kind !== "address";
  const expanded =
    open && (rows.length > 0 || showNoMatch || notice !== null || busy || addressNote !== null);
  const optionId = (i: number): string => `${uid}-opt-${i}`;

  const change = (value: string): void => {
    setText(value);
    setNotice(null);
    setActive(-1);
    setOpen(true);
  };

  const choose = async (row: Row): Promise<void> => {
    const { option } = row;
    if (option.disabled === true) return;
    if (row.saved !== undefined) {
      setText("");
      setOpen(false);
      setLastPlace(null);
      onApplySaved?.(row.saved);
      return;
    }
    const remember = (): void => {
      const entry = toRecent(option);
      if (entry !== null) setRecent(pushRecent(entry));
    };
    if (option.point !== undefined) {
      setText(option.label);
      setOpen(false);
      setLastPlace({ label: option.label, ...option.point });
      remember();
      onCentre(option.point);
      return;
    }
    if (option.kind === "address") {
      if (option.property !== undefined) {
        const { propertyCid, lat, lng } = option.property;
        setText(option.label);
        setOpen(false);
        remember();
        onOpenProperty(propertyCid, { lat, lng });
      } else if (option.lookup !== undefined) {
        // A "Try" sample: put the address in the box; the lookup runs like typed text.
        change(option.lookup);
      }
      return;
    }
    if ((option.kind === "permit" || option.kind === "tcad") && option.lookup !== undefined) {
      const value = option.lookup;
      if (row.sample) setText(value);
      setBusy(true);
      setNotice(null);
      try {
        const result = await lookup(option.kind, value);
        if (result.found) {
          setOpen(false);
          remember();
          onOpenProperty(result.propertyCid, { lat: result.lat, lng: result.lng });
        } else {
          const what = option.kind === "permit" ? "permit" : "TCAD account";
          setNotice(`No ${what} ${value} in ${result.runId ?? "the current run"}`);
        }
      } catch {
        setNotice("The lookup failed. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    }
  };

  const removeRow = (row: Row): void => {
    setActive(-1);
    if (row.saved !== undefined) setSaved(removeSaved(row.saved.id));
    else if (row.group === "recent") setRecent(removeRecent(row.option.id));
  };

  const savedHere = current === null ? undefined : saved.find((s) => s.id === savedId(current));
  const toggleSaved = (): void => {
    if (current === null) return;
    if (savedHere !== undefined) {
      setSaved(removeSaved(savedHere.id));
      return;
    }
    const place = lastPlace !== null && samePoint(lastPlace, current) ? lastPlace.label : undefined;
    setSaved(pushSaved(current, defaultSavedName(current, place)));
  };

  const step = (dir: 1 | -1): void => {
    const enabled = rows.flatMap((r, i) => (r.option.disabled === true ? [] : [i]));
    if (enabled.length === 0) return;
    const at = enabled.indexOf(active);
    const next =
      at === -1
        ? dir === 1
          ? 0
          : enabled.length - 1
        : (at + dir + enabled.length) % enabled.length;
    setActive(enabled[next] ?? -1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Delete" && empty && expanded && active >= 0) {
      // Keyboard shortcut for the per-item remove button, with focus staying in the input.
      const row = rows[active];
      if (row !== undefined && (row.group === "recent" || row.group === "saved")) {
        event.preventDefault();
        removeRow(row);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = active >= 0 ? rows[active] : rows.find((r) => r.option.disabled !== true);
      if (target !== undefined && !busy) void choose(target);
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setActive(-1);
      } else if (text !== "") {
        event.preventDefault();
        event.stopPropagation();
        change("");
        setOpen(false);
      }
    }
  };

  const hasGazetteer = rows.some((r) => r.option.kind === "place" || r.option.kind === "zip");
  const provenance = empty
    ? PROVENANCE_SAMPLES
    : hasGazetteer
      ? GAZETTEER_PROVENANCE
      : kind === "permit" || kind === "tcad"
        ? PROVENANCE_EXACT
        : kind === "address" && rows.length > 0
          ? PROVENANCE_EXACT
          : null;

  return (
    <div
      className={styles.root}
      role="search"
      onBlur={(e) => {
        // Focus moving between the input and the list's buttons keeps the list open.
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className={styles.field}>
        <Icon name="search" size="medium" />
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          role="combobox"
          aria-label="Search an address, place, ZIP or permit"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          placeholder="Search an address, place, ZIP or permit"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={text}
          onChange={(e) => change(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {text !== "" ? (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              change("");
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size="medium" />
          </button>
        ) : null}
        <button
          type="button"
          className={styles.save}
          aria-label="Save this search"
          aria-pressed={savedHere !== undefined}
          disabled={current === null || (savedHere === undefined && saved.length >= MAX_SAVED)}
          title={
            current === null
              ? "Pick a place or drop a pin first"
              : savedHere !== undefined
                ? "Saved in this browser. Press to remove."
                : "Save this centre, radius and roof filter in this browser"
          }
          onClick={toggleSaved}
        >
          <Icon name={savedHere === undefined ? "bookmark_add" : "bookmark_added"} size="medium" />
        </button>
      </div>
      <div className={styles.popup} hidden={!expanded}>
        <ul id={listId} role="listbox" aria-label="Search suggestions" className={styles.list}>
          {rows.map((row, i) => {
            const startsGroup = row.group !== undefined && rows[i - 1]?.group !== row.group;
            const removable = row.group === "recent" || row.group === "saved";
            return (
              <li key={`${row.group ?? "o"}-${row.option.id}`} role="presentation">
                {startsGroup && row.group !== undefined ? (
                  <div className={styles.groupRow}>
                    <p className={styles.group}>{GROUP_TITLE[row.group]}</p>
                    {row.group === "recent" ? (
                      <button
                        type="button"
                        className={styles.groupAction}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setRecent(clearRecent());
                          setActive(-1);
                          inputRef.current?.focus();
                        }}
                      >
                        Clear recent
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className={styles.item}>
                  <div
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={row.option.disabled === true ? true : undefined}
                    data-kind={row.saved !== undefined ? "saved" : row.option.kind}
                    className={styles.option}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => {
                      if (row.option.disabled !== true) setActive(i);
                    }}
                    onClick={() => void choose(row)}
                  >
                    <span className={styles.label}>
                      {row.option.label}
                      {row.saved !== undefined ? <span className={styles.badge}>Saved</span> : null}
                    </span>
                    {row.option.detail !== undefined ? (
                      <span className={styles.detail}>{row.option.detail}</span>
                    ) : null}
                  </div>
                  {removable ? (
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${row.option.label} from ${row.group === "saved" ? "saved" : "recent"}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        removeRow(row);
                        inputRef.current?.focus();
                      }}
                    >
                      <Icon name="close" size="medium" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {showNoMatch ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>No place or ZIP in Travis County matches</span>
              <span className={styles.detail}>{`"${text.trim()}" is not in the gazetteer`}</span>
            </li>
          ) : null}
          {busy ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>Looking up…</span>
            </li>
          ) : null}
          {addressNote !== null ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>{addressNote}</span>
            </li>
          ) : null}
          {notice !== null ? (
            <li role="option" aria-disabled="true" aria-selected="false" className={styles.option}>
              <span className={styles.label}>{notice}</span>
            </li>
          ) : null}
        </ul>
        {empty ? <p className={styles.note}>{NOTE_LOCAL}</p> : null}
        {provenance !== null ? <p className={styles.provenance}>{provenance}</p> : null}
      </div>
    </div>
  );
}
