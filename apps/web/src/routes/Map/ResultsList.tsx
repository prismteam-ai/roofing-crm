// The Matches panel's content (boards CrmMap768, CrmMapPin390): the results header, the rows of the
// current page (collapsed unless opened, expanded state kept per row), and the numbered pager over
// the rows the search loaded. The server returns at most 100 rows nearest the centre; when it
// clipped the set, the panel says so (`note`) and the footer reads "of the nearest 100", never a
// page as the whole set. Only the page's rows are drawn, so a 100-row answer costs ten cards.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { MAX_PROPERTY_ROWS } from "@crm/domain";
import { ResultRow } from "./ResultRow.js";
import { ResultsPager } from "./ResultsPager.js";
import { ResultsPanel } from "./ResultsPanel.js";
import { WhyPanel } from "./WhyPanel.js";
import { pageSlice } from "./resultsView.js";
import styles from "./ResultsList.module.css";

export interface ResultsListProps {
  readonly rows: readonly Provenanced<CrmProperty>[];
  /** The server's match count for the whole question (the header's "Matches N"). */
  readonly total: number;
  /** True when `rows` is only the nearest part of `total`. */
  readonly clipped: boolean;
  readonly note?: string | undefined;
  readonly center: LatLng | null;
  readonly selectedCid: string | null;
  readonly onSelect: (propertyCid: string) => void;
  /** This property's permits, by property CID; null when permits were not requested. */
  readonly permitsByPropertyCid: ReadonlyMap<string, readonly Provenanced<CrmPermit>[]> | null;
  readonly onTriage?: (() => void) | undefined;
  /** The search radius and where it is centred, for the "Why is this a lead?" panel's rule. */
  readonly radiusMi?: number | undefined;
  readonly centreLabel?: string | undefined;
}

export function ResultsList({
  rows,
  total,
  clipped,
  note,
  center,
  selectedCid,
  onSelect,
  permitsByPropertyCid,
  onTriage,
  radiusMi,
  centreLabel,
}: ResultsListProps): ReactElement {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // The property whose "Why is this a lead?" panel replaces the list; a new answer closes it.
  const [whyCid, setWhyCid] = useState<string | null>(null);
  // A new answer starts on page 1 with every row collapsed.
  useEffect(() => {
    setPage(1);
    setWhyCid(null);
    setExpanded((open) => (open.size === 0 ? open : new Set()));
  }, [rows]);
  const slice = pageSlice(rows.length, page);
  const pageRows = useMemo(
    () => rows.slice(slice.start, slice.end),
    [rows, slice.start, slice.end],
  );

  const toggle = useCallback((propertyCid: string) => {
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(propertyCid)) next.add(propertyCid);
      return next;
    });
  }, []);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  const expandAll = useCallback(
    () => setExpanded((open) => new Set([...open, ...pageRows.map((r) => r.propertyCid)])),
    [pageRows],
  );
  // The centre object changes with every URL change; only its two numbers matter to a row.
  const lat = center?.lat;
  const lng = center?.lng;
  const stableCenter = useMemo<LatLng | undefined>(
    () => (lat === undefined || lng === undefined ? undefined : { lat, lng }),
    [lat, lng],
  );

  const showing =
    rows.length === 0
      ? ""
      : `Showing ${String(slice.start + 1)}–${String(slice.end)} of ${clipped ? "the nearest " : ""}${String(rows.length)}`;

  const whyRow = whyCid === null ? undefined : rows.find((r) => r.propertyCid === whyCid);
  if (whyRow !== undefined) {
    return (
      <WhyPanel
        property={whyRow}
        permits={permitsByPropertyCid?.get(whyRow.propertyCid)}
        center={stableCenter}
        radiusMi={radiusMi}
        centreLabel={centreLabel}
        onBack={() => setWhyCid(null)}
        onDetails={onSelect}
      />
    );
  }

  return (
    <ResultsPanel
      count={total}
      triageCount={Math.min(rows.length, MAX_PROPERTY_ROWS)}
      note={note}
      onCollapseAll={collapseAll}
      onExpandAll={expandAll}
      {...(onTriage === undefined ? {} : { onTriage })}
      footer={
        rows.length === 0 ? undefined : (
          <ResultsPager slice={slice} showing={showing} onPage={setPage} />
        )
      }
    >
      <ul className={styles.results} aria-label="Results" data-testid="search-results">
        {pageRows.map((property) => (
          <li key={property.propertyCid}>
            <ResultRow
              row={property}
              selected={selectedCid === property.propertyCid}
              onSelect={onSelect}
              onWhy={setWhyCid}
              expanded={expanded.has(property.propertyCid)}
              onToggleExpanded={toggle}
              {...(stableCenter === undefined ? {} : { center: stableCenter })}
              {...(permitsByPropertyCid === null
                ? {}
                : { permits: permitsByPropertyCid.get(property.propertyCid) })}
            />
          </li>
        ))}
      </ul>
    </ResultsPanel>
  );
}
