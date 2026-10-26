// The List view for an Ask AI answer (`/map?view=list` with an answer present): the answer's matched
// properties in the SAME table as the filter results (same columns, header, pager, row design), so
// the List never goes blank after a question. It is clearly labelled with where the rows come from
// ("From your question: ..."), says when the answer lists only the top part of a larger total, keeps
// each row's missing-data reasons (shared Missing list), and offers "Show filter results" to go back.
// The "#" column carries the citation number: the same number as the Ask panel and the map pin.
// Nothing is invented: a column the answer does not carry says so. Render-only.
import type { AgentAnswer } from "@crm/shared";
import { Icon, MissingList, Popover } from "@crm/ui";
import { useId, useState, type ReactElement } from "react";
import {
  answerMatchTotal,
  answerRowsNote,
  answerShowsDistance,
  distinctAnswerRows,
  missingGroups,
  rowPermitText,
} from "../../Ask/askCopy.js";
import {
  coordinateSourceLabel,
  missingReasonText,
  roofAgeBucket,
  roofAgeConfidenceLabel,
} from "../../../format/index.js";
import { COVERAGE_NOTE, DEFAULT_PAGE_SIZE } from "./CandidateList.js";
import { shortBasis } from "./candidates.js";
import styles from "./CandidateList.module.css";

type AnswerRow = NonNullable<AgentAnswer["rows"]>[number];

const CONFIDENCE_CLASS: Readonly<Record<string, string | undefined>> = {
  high: styles.confHigh,
  medium: styles.confMedium,
  low: styles.confLow,
  none: styles.confNone,
};

const NOT_IN_ANSWER = "not part of this answer";

export interface AnswerListProps {
  readonly answer: AgentAnswer;
  /** The question the rows answer, shown in the source label. */
  readonly asked: string;
  readonly selectedCid?: string | null | undefined;
  readonly onSelect?: ((propertyCid: string) => void) | undefined;
  readonly onShowOnMap?: ((propertyCid: string) => void) | undefined;
  /** Goes back to the filter results. */
  readonly onShowFilterResults: () => void;
  readonly pageSize?: number | undefined;
}

function RoofCell({ row }: { readonly row: AnswerRow }): ReactElement {
  if (row.roofAgeYears === undefined) {
    const entry = row.missing.find(
      (m) => m.field === "roofAgeYears" || m.field === "roof_age_years",
    );
    return (
      <span className={styles.muted} data-field="roof_age_years">
        {entry === undefined
          ? `Not published · no reason recorded`
          : `Not published · ${missingReasonText(entry.field, entry.reason)}`}
      </span>
    );
  }
  const years = Math.round(row.roofAgeYears);
  const bucket = roofAgeBucket(years);
  return (
    <span className={styles.roof} data-field="roof_age_years">
      <span
        className={styles.swatch}
        aria-hidden="true"
        style={bucket === null ? undefined : { background: `var(${bucket.token})` }}
      />
      {`${String(years)} yrs`}
    </span>
  );
}

function Row({
  row,
  active,
  onSelect,
  onShowOnMap,
  showDistance,
}: {
  readonly row: AnswerRow;
  readonly showDistance: boolean;
  readonly active: boolean;
  readonly onSelect: AnswerListProps["onSelect"];
  readonly onShowOnMap: AnswerListProps["onShowOnMap"];
}): ReactElement {
  const title = `TCAD ${row.tcadId}`;
  const groups = missingGroups(row.missing);
  return (
    <tr
      className={`${styles.row} ${active ? styles.rowActive : ""}`}
      data-candidate-row=""
      data-answer-row=""
      data-property-cid={row.propertyCid}
      {...(row.citationId === undefined ? {} : { "data-citation-id": String(row.citationId) })}
    >
      <td className={`${styles.cNum} ${styles.wide840}`}>
        {row.citationId === undefined ? null : (
          <span className={styles.order} data-citation-number="">
            {row.citationId}
          </span>
        )}
      </td>
      <td className={styles.cAddress}>
        <span className={styles.title}>{title}</span>
        <span className={styles.sub}>
          {row.address ?? `Street address ${NOT_IN_ANSWER}`}
          {row.nearPlace === undefined || !showDistance
            ? ""
            : ` · near ${row.nearPlace.name} · ${row.nearPlace.distanceMi.toFixed(1)} mi`}
        </span>
        <span className={styles.kindLine}>
          <span className={styles.muted}>{`Type not published · ${NOT_IN_ANSWER}`}</span>
        </span>
        {groups.length === 0 ? null : <MissingList groups={groups} />}
      </td>
      <td className={styles.cRoof}>
        <RoofCell row={row} />
      </td>
      <td className={`${styles.cBasis} ${styles.wide1240}`}>
        {row.roofAgeBasis === undefined ? (
          <span className={styles.muted}>{NOT_IN_ANSWER}</span>
        ) : (
          shortBasis(row.roofAgeBasis)
        )}
      </td>
      <td className={styles.cConf}>
        {row.roofAgeConfidence === undefined ? (
          <span className={styles.muted}>{NOT_IN_ANSWER}</span>
        ) : (
          <span className={`${styles.conf} ${CONFIDENCE_CLASS[row.roofAgeConfidence] ?? ""}`}>
            {roofAgeConfidenceLabel(row.roofAgeConfidence)}
          </span>
        )}
      </td>
      <td className={`${styles.cPermit} ${styles.wide768}`}>
        {row.permit === undefined ? (
          <span className={styles.muted} data-field="main_permit">
            No permit in this answer
          </span>
        ) : (
          <span data-field="main_permit">{rowPermitText(row)}</span>
        )}
      </td>
      <td className={`${styles.cMi} ${styles.wide768}`}>
        {row.nearPlace === undefined || !showDistance ? (
          <span className={styles.muted}>
            {showDistance ? "No location" : "Not from a search centre"}
          </span>
        ) : (
          <span title={`Distance from ${row.nearPlace.name}, not from a search centre`}>
            {row.nearPlace.distanceMi.toFixed(1)}
          </span>
        )}
      </td>
      <td className={`${styles.cLatLon} ${styles.wide1032}`}>
        {row.lat === undefined || row.lon === undefined ? (
          <span className={styles.muted}>{coordinateSourceLabel("none")}</span>
        ) : (
          `${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}`
        )}
      </td>
      <td className={styles.cActions}>
        <span className={styles.actions}>
          {onSelect === undefined ? null : (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.primaryIcon}`}
              aria-label={`Open details for ${title}`}
              onClick={() => onSelect(row.propertyCid)}
            >
              <Icon name="open_in_new" size="medium" />
            </button>
          )}
          {onShowOnMap === undefined ? null : (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.primaryIcon} ${styles.wide1240}`}
              aria-label={`Show ${title} on the map`}
              onClick={() => onShowOnMap(row.propertyCid)}
            >
              <Icon name="explore" size="medium" />
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

export function AnswerList({
  answer,
  asked,
  selectedCid = null,
  onSelect,
  onShowOnMap,
  onShowFilterResults,
  pageSize = DEFAULT_PAGE_SIZE,
}: AnswerListProps): ReactElement {
  const rows = distinctAnswerRows(answer.rows);
  const showDistance = answerShowsDistance(answer);
  const [page, setPage] = useState(1);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const total = answerMatchTotal(answer);
  const clip = answerRowsNote(answer);
  const question = asked.trim() === "" ? "your question" : asked.trim();
  return (
    <section
      className={styles.list}
      aria-label="Candidate list"
      data-candidate-list=""
      data-list-source="answer"
    >
      <header className={styles.head}>
        <p className={styles.summary} title={question} data-list-source-label="">
          {`From your question: ${question}`}
        </p>
        <button type="button" className={styles.toggle} onClick={onShowFilterResults}>
          <Icon name="filter_list" size="medium" />
          <span>Show filter results</span>
        </button>
        <span className={styles.matches} data-matches={String(total)}>
          Matches <span className={styles.num}>{total.toLocaleString("en-US")}</span>
        </span>
        <span className={styles.noteWrap}>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.warnIcon}`}
            aria-label="Permit coverage note"
            aria-expanded={noteOpen}
            aria-controls={noteId}
            onClick={() => setNoteOpen((o) => !o)}
          >
            <Icon name="info" size="medium" />
          </button>
          <div id={noteId}>
            <Popover
              open={noteOpen}
              onClose={() => setNoteOpen(false)}
              label="Permit coverage note"
              align="end"
            >
              <p className={styles.noteText}>{COVERAGE_NOTE}</p>
            </Popover>
          </div>
        </span>
      </header>
      {clip === undefined ? null : (
        <p className={styles.clipped} role="status" data-state="CrmAnswerListClipped">
          <Icon name="info" size="medium" />
          <span>{clip}</span>
        </p>
      )}
      {answer.missing.length === 0 ? null : (
        <div className={styles.partial}>
          <MissingList groups={missingGroups(answer.missing)} />
        </div>
      )}
      <div className={styles.body}>
        <table className={styles.table} aria-label="Candidates" data-testid="candidate-table">
          <thead>
            <tr>
              <th scope="col" className={`${styles.cNum} ${styles.wide840}`}>
                #
              </th>
              <th scope="col">Address</th>
              <th scope="col">Roof</th>
              <th scope="col" className={styles.wide1240}>
                Basis
              </th>
              <th scope="col">Conf.</th>
              <th scope="col" className={styles.wide768}>
                Permit
              </th>
              <th scope="col" className={styles.wide768}>
                Mi
              </th>
              <th scope="col" className={styles.wide1032}>
                Lat, lon
              </th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <Row
                key={`${row.propertyCid}|${row.permit?.permitCid ?? ""}`}
                row={row}
                showDistance={showDistance}
                active={selectedCid === row.propertyCid}
                onSelect={onSelect}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </tbody>
        </table>
      </div>
      <footer className={styles.foot}>
        <span className={styles.showing}>
          {`Showing ${String(start + 1)}–${String(start + pageRows.length)} of ${
            total > rows.length ? "the top " : ""
          }${String(rows.length)} · in the order the answer gave them`}
        </span>
        <nav className={styles.pager} aria-label="Pages">
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Previous page"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <Icon name="chevron_left" size="medium" />
          </button>
          <span className={styles.pageNum} aria-current="page">
            {current}
          </span>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Next page"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            <Icon name="chevron_right" size="medium" />
          </button>
        </nav>
      </footer>
    </section>
  );
}
