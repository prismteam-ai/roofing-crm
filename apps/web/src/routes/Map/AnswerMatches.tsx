// Ask AI matches, drawn with the SAME pieces as the filter results (PM review 2026-10-26: "matching
// shall be shown with the same design regardless it comes from AI or filter"). An answer row is
// adapted to `MatchCard` (the card ResultRow uses), listed under `ResultsPanel` (the "Matches N"
// header) with `ResultsPager`. The answer rows carry no street address, property type, coordinate
// source or record CID, so those places show the same placeholder with the honest reason; nothing is
// invented. The citation badge is the pin's number; the focused citation highlights its card.
import type { AgentAnswer } from "@crm/shared";
import { CidDisplay, MissingList, MissingReason, Provenance, StatusPill, formatUtc } from "@crm/ui";
import type { MissingReason as Reason } from "@crm/oracle-contract";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  answerMatchTotal,
  answerRowsNote,
  answerShowsDistance,
  distinctAnswerRows,
  matchesEmptyText,
  missingGroups,
  rowNearText,
} from "../Ask/askCopy.js";
import {
  contractorResolutionLabel,
  coordinateSourceLabel,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  roofAgeText,
} from "../../format/index.js";
import { PermitChip } from "./PermitChip.js";
import {
  DistanceLabel,
  FieldGrid,
  MatchCard,
  RoofChips,
  SignalLines,
  TitleStack,
} from "./ResultRow.js";
import { ResultsPager } from "./ResultsPager.js";
import { ResultsPanel } from "./ResultsPanel.js";
import { SourceLink, safeSourceHref } from "./SourceLink.js";
import { pageSlice } from "./resultsView.js";
import styles from "./ResultsList.module.css";
import rowStyles from "./ResultRow.module.css";

type AnswerRow = NonNullable<AgentAnswer["rows"]>[number];

export const NOT_IN_ANSWER = "not part of this answer";

/** The reason on a row's own `missing` entry for a roof age, else undefined. */
function roofGap(row: AnswerRow): ReactElement {
  const entry = row.missing.find((m) => m.field === "roofAgeYears" || m.field === "roof_age_years");
  return entry === undefined ? (
    <StatusPill status="unavailable" text="Roof age not available" />
  ) : (
    <MissingReason field={entry.field} reason={entry.reason as Reason} />
  );
}

function RowProvenanceLine({
  row,
  answer,
}: {
  readonly row: AnswerRow;
  readonly answer: AgentAnswer;
}): ReactElement {
  const citation =
    row.citationId === undefined
      ? undefined
      : answer.citations.find((c) => c.id === row.citationId);
  if (citation === undefined) {
    return (
      <Provenance>
        <span data-source-missing="">
          No source record attached: only rows the answer cites carry one
        </span>
      </Provenance>
    );
  }
  return (
    <Provenance>
      Source:{" "}
      {safeSourceHref(citation.sourceUrl) === null ? (
        <span data-source-missing="">No source link published</span>
      ) : (
        <SourceLink url={citation.sourceUrl} label="source record" />
      )}
      {" · collected "}
      <time dateTime={citation.capturedAt}>{formatUtc(citation.capturedAt)}</time>
      {" UTC · table "}
      <CidDisplay cid={citation.tableCid} />
      {` · citation ${String(citation.id)}`}
    </Provenance>
  );
}

export interface AnswerMatchRowProps {
  readonly row: AnswerRow;
  readonly answer: AgentAnswer;
  readonly focused: boolean;
  readonly expanded: boolean;
  readonly onToggleExpanded: (propertyCid: string) => void;
  readonly onOpen: (propertyCid: string) => void;
  /** Extra controls under the detail (the per-row Create lead). */
  readonly extra?: ReactNode;
}

/** One Ask AI match, as a `MatchCard`. */
export function AnswerMatchRow({
  row,
  answer,
  focused,
  expanded,
  onToggleExpanded,
  onOpen,
  extra,
}: AnswerMatchRowProps): ReactElement {
  const near = answerShowsDistance(answer) ? rowNearText(row) : undefined;
  const hasCoords = row.lat !== undefined && row.lon !== undefined;
  return (
    <MatchCard
      propertyCid={row.propertyCid}
      citation={row.citationId}
      focused={focused}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      onSelect={onOpen}
      data={{
        "tcad-id": row.tcadId,
        ...(row.citationId === undefined ? {} : { "citation-id": String(row.citationId) }),
      }}
      title={
        // Same structure as a filter result card: the address leads and the TCAD id sits under it;
        // a row without an address leads with the TCAD id and says why the address is missing.
        <TitleStack
          main={row.address ?? `TCAD ${row.tcadId}`}
          sub={row.address === undefined ? `Street address ${NOT_IN_ANSWER}` : `TCAD ${row.tcadId}`}
        />
      }
      distance={
        near === undefined ? null : (
          <DistanceLabel
            text={near}
            title="Distance from the nearest place centroid, not from a search centre"
          />
        )
      }
      badges={
        <>
          <RoofChips
            years={row.roofAgeYears === undefined ? null : Math.round(row.roofAgeYears)}
            confidence={row.roofAgeConfidence}
            gap={roofGap(row)}
          />
          {row.permit === undefined ? null : (
            <PermitChip
              permit={{
                openDays: row.permit.openDays ?? null,
                statusClass: row.permit.statusClass,
                permitNumber: row.permit.number,
              }}
            />
          )}
        </>
      }
      actions={extra}
      detail={
        <>
          <p className={rowStyles.cidLine}>
            Property <CidDisplay cid={row.propertyCid} />
          </p>
          <FieldGrid
            roofAge={
              row.roofAgeYears === undefined
                ? roofGap(row)
                : roofAgeText(Math.round(row.roofAgeYears), row.roofAgeBasis)
            }
            basis={
              row.roofAgeBasis === undefined
                ? `Basis ${NOT_IN_ANSWER}`
                : roofAgeBasisLabel(row.roofAgeBasis)
            }
            confidence={
              row.roofAgeConfidence === undefined
                ? `Confidence ${NOT_IN_ANSWER}`
                : roofAgeConfidenceLabel(row.roofAgeConfidence)
            }
            coordinates={
              hasCoords
                ? `${row.lat?.toFixed(5) ?? ""}, ${row.lon?.toFixed(5) ?? ""} · source ${NOT_IN_ANSWER}`
                : coordinateSourceLabel("none")
            }
          />
          {row.contractorResolution === undefined ? null : (
            <SignalLines
              lines={[
                {
                  field: "contractor_resolution",
                  content: `Contractor: ${contractorResolutionLabel(row.contractorResolution)}`,
                },
              ]}
            />
          )}
          <MissingList
            groups={[
              ...missingGroups(row.missing),
              // The answer rows carry no property type: the chip is left out of the card and the
              // reason is stated here instead (constitution P0-4).
              {
                key: "property_usage_type|not_in_answer",
                reason: "Not part of this answer",
                fields: "property type",
                count: undefined,
                data: { reason: "not_in_answer", fields: "property_usage_type" },
              },
            ]}
          />
          <RowProvenanceLine row={row} answer={answer} />
        </>
      }
    />
  );
}

export interface AnswerMatchesProps {
  readonly answer: AgentAnswer;
  readonly focusedCitation: number | null;
  readonly onOpen: (propertyCid: string) => void;
  /** Per-row extra controls (the Create lead action), by TCAD id. */
  readonly extraFor?: ((row: AnswerRow) => ReactNode) | undefined;
}

/** The whole Matches panel for an answer: header, rows, pager. */
export function AnswerMatches({
  answer,
  focusedCitation,
  onOpen,
  extraFor,
}: AnswerMatchesProps): ReactElement {
  const rows = useMemo(() => distinctAnswerRows(answer.rows), [answer.rows]);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setPage(1);
    setExpanded((open) => (open.size === 0 ? open : new Set()));
  }, [rows]);
  const slice = pageSlice(rows.length, page);
  const pageRows = rows.slice(slice.start, slice.end);
  const toggle = useCallback((cid: string) => {
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(cid)) next.add(cid);
      return next;
    });
  }, []);
  if (answer.rows === undefined || rows.length === 0) {
    return <p className={rowStyles.cidLine}>{matchesEmptyText(answer.rows)}</p>;
  }
  const total = answerMatchTotal(answer);
  const showing = `Showing ${String(slice.start + 1)}–${String(slice.end)} of ${
    total > rows.length ? "the top " : ""
  }${String(rows.length)}`;
  return (
    <ResultsPanel
      count={total}
      note={answerRowsNote(answer)}
      onCollapseAll={() => setExpanded(new Set())}
      onExpandAll={() =>
        setExpanded((open) => new Set([...open, ...pageRows.map((r) => r.propertyCid)]))
      }
      footer={<ResultsPager slice={slice} showing={showing} onPage={setPage} />}
    >
      <ul className={styles.results} aria-label="Matches" data-testid="answer-matches">
        {pageRows.map((row) => (
          <li key={`${row.propertyCid}|${row.permit?.permitCid ?? ""}`}>
            <AnswerMatchRow
              row={row}
              answer={answer}
              focused={row.citationId !== undefined && row.citationId === focusedCitation}
              expanded={expanded.has(row.propertyCid)}
              onToggleExpanded={toggle}
              onOpen={onOpen}
              extra={extraFor?.(row)}
            />
          </li>
        ))}
      </ul>
    </ResultsPanel>
  );
}
