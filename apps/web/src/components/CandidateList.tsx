import type { Candidate, Lead, SearchResult } from '@roofing-crm/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addressLine,
  candidateKind,
  formatCount,
  formatMiles,
  formatOpenDuration,
  isLongOpen,
  roofAgeText,
  roofBasisText,
} from '../lib/format.js';
import { Notice, Spinner } from './fields.js';

export const PAGE_SIZE = 50;

export interface CandidateListProps {
  hasPin: boolean;
  result: SearchResult | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  roofAgeThreshold: number;
  selectedApn: string | null;
  leadByApn: ReadonlyMap<string, Lead>;
  pendingApns: ReadonlySet<string>;
  onSelect: (candidate: Candidate) => void;
  onDetails: (apn: string) => void;
  onAddLeads: (candidates: Candidate[]) => void;
  onOpenLead: (lead: Lead) => void;
  onRetry: () => void;
}

interface RowProps {
  candidate: Candidate;
  roofAgeThreshold: number;
  selected: boolean;
  checked: boolean;
  lead: Lead | undefined;
  pending: boolean;
  onCheck: (checked: boolean) => void;
  onSelect: () => void;
  onDetails: () => void;
  onAddLead: () => void;
  onOpenLead: (lead: Lead) => void;
}

function CandidateRow(props: RowProps) {
  const { candidate: c, lead } = props;
  const [showReasons, setShowReasons] = useState(false);
  // "Add lead" turns into "Open lead" in the same spot. A double-click on Add must not also
  // open the lead, so Open ignores clicks for a moment after the lead appears.
  const leadSeenAt = useRef<number | null>(null);
  if (lead && leadSeenAt.current === null) leadSeenAt.current = Date.now();
  if (!lead) leadSeenAt.current = null;
  const kind = candidateKind(c, props.roofAgeThreshold);
  const address = addressLine(c.address, c.apn);
  const long = isLongOpen(c.longestOpenDays);
  const reasons =
    c.scoreReasons.length > 0 ? c.scoreReasons : ['No scoring signals at this threshold'];

  return (
    <li
      className={`cand kind-${kind}${props.selected ? ' is-selected' : ''}`}
      data-testid="candidate-row"
      data-apn={c.apn}
      aria-current={props.selected ? 'true' : undefined}
    >
      <input
        type="checkbox"
        className="cand-check"
        checked={props.checked}
        aria-label={`Select ${address} for bulk convert`}
        data-testid="candidate-check"
        onChange={(event) => {
          props.onCheck(event.target.checked);
        }}
      />
      <div className="cand-main">
        <button
          type="button"
          className="cand-title"
          data-testid="candidate-select"
          title="Highlight on the map"
          onClick={props.onSelect}
        >
          {address}
        </button>
        <div className="cand-sub">
          {[c.city, c.zip].filter(Boolean).join(' ')} &middot; {formatMiles(c.distanceMiles)}
          {c.useType ? <> &middot; {c.useType}</> : null}
        </div>
        <div className="cand-signals">
          <span className="cand-roof" data-testid="candidate-roof">
            <strong>{roofAgeText(c.roofAgeYears)}</strong>
            <span className="muted">
              {' '}
              {roofBasisText(c.roofBasis, c.roofYear)}
              {c.roofConfidence ? ` · ${c.roofConfidence} confidence` : ''}
            </span>
          </span>
          {c.openRoofPermits > 0 && (
            <span
              className={`badge badge-permit${long ? ' badge-long' : ''}`}
              data-testid="candidate-permit"
            >
              {c.openRoofPermits > 1
                ? `${String(c.openRoofPermits)} open roofing permits`
                : 'Open roofing permit'}
              {' · '}
              {formatOpenDuration(c.longestOpenDays)}
            </span>
          )}
        </div>
        {showReasons && (
          <ul className="cand-reasons" data-testid="candidate-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="cand-side">
        <button
          type="button"
          className={`score score-${c.score >= 60 ? 'high' : c.score >= 30 ? 'mid' : 'low'}`}
          aria-expanded={showReasons}
          aria-label={`Lead score ${String(c.score)}. Show why.`}
          title={reasons.join('\n')}
          data-testid="candidate-score"
          onClick={() => {
            setShowReasons((open) => !open);
          }}
        >
          <span className="score-label">Score</span> {c.score}
        </button>
        <div className="cand-actions">
          <button
            type="button"
            className="btn btn-small"
            data-testid="candidate-details"
            onClick={props.onDetails}
          >
            Details
          </button>
          {lead ? (
            <button
              key="open"
              type="button"
              className="btn btn-small btn-done"
              data-testid="candidate-open-lead"
              onClick={() => {
                if (Date.now() - (leadSeenAt.current ?? 0) > 700) props.onOpenLead(lead);
              }}
            >
              Lead &#10003; &middot; Open lead
            </button>
          ) : (
            <button
              key="add"
              type="button"
              className="btn btn-small btn-primary"
              data-testid="candidate-add-lead"
              disabled={props.pending}
              onClick={props.onAddLead}
            >
              {props.pending ? 'Adding…' : 'Add lead'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Browsable list of the properties the current pin, radius and filters matched. */
export function CandidateList(props: CandidateListProps) {
  const { result, selectedApn, leadByApn } = props;
  const candidates = useMemo(() => result?.candidates ?? [], [result]);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const listRef = useRef<HTMLUListElement | null>(null);

  const pageCount = Math.max(1, Math.ceil(candidates.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visible = candidates.slice(start, start + PAGE_SIZE);

  // New result set: back to the first page, and forget ticks for rows that are gone.
  useEffect(() => {
    setPage(0);
    setChecked((current) => {
      const present = new Set(candidates.map((c) => c.apn));
      const kept = [...current].filter((apn) => present.has(apn));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [candidates]);

  // Selection from the map: turn to the row's page, then scroll it into view.
  useEffect(() => {
    if (!selectedApn) return;
    const index = candidates.findIndex((c) => c.apn === selectedApn);
    if (index < 0) return;
    setPage(Math.floor(index / PAGE_SIZE));
    const frame = window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-apn="${CSS.escape(selectedApn)}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedApn, candidates]);

  const convertible = candidates.filter((c) => checked.has(c.apn) && !leadByApn.has(c.apn));
  const pageAllChecked = visible.length > 0 && visible.every((c) => checked.has(c.apn));

  const toggle = (apn: string, on: boolean): void => {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(apn);
      else next.delete(apn);
      return next;
    });
  };

  if (!props.hasPin) {
    return (
      <div className="empty" data-testid="list-empty-nopin">
        <h3>Start with a location</h3>
        <p>
          Click the map to drop a pin, press <strong>Use my location</strong>, or pick a place under{' '}
          <strong>Jump to</strong>. Matching properties appear here.
        </p>
      </div>
    );
  }

  if (props.error) {
    return (
      <Notice
        kind="error"
        testId="search-error"
        action={
          <button
            type="button"
            className="btn btn-small"
            data-testid="search-retry"
            onClick={props.onRetry}
          >
            Retry
          </button>
        }
      >
        <strong>Search failed.</strong> {props.error}
      </Notice>
    );
  }

  if (props.isLoading || !result) {
    return (
      <div className="empty" data-testid="list-loading">
        <Spinner label="Searching properties in the radius…" />
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="empty" data-testid="list-empty">
        <h3>No matches in this area</h3>
        <p>
          Nothing inside the radius meets the current filters. Try a larger radius, a lower roof-age
          threshold, or set Signal to &ldquo;Any&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`cand-wrap${props.isFetching ? ' is-refreshing' : ''}`}
      aria-busy={props.isFetching}
    >
      <div className="cand-toolbar">
        <label className="check-all">
          <input
            type="checkbox"
            checked={pageAllChecked}
            data-testid="select-page"
            onChange={(event) => {
              setChecked((current) => {
                const next = new Set(current);
                for (const c of visible) {
                  if (event.target.checked) next.add(c.apn);
                  else next.delete(c.apn);
                }
                return next;
              });
            }}
          />
          Select page
        </label>
        <button
          type="button"
          className="btn btn-small btn-primary"
          data-testid="convert-selected"
          disabled={convertible.length === 0}
          onClick={() => {
            props.onAddLeads(convertible);
            setChecked(new Set());
          }}
        >
          Convert selected to leads{checked.size > 0 ? ` (${String(convertible.length)})` : ''}
        </button>
      </div>

      {result.total > candidates.length && (
        <p className="cand-cap" data-testid="list-capped">
          Showing the top {formatCount(candidates.length)} of {formatCount(result.total)} matches.
          Narrow the radius or filters to see the rest.
        </p>
      )}

      <ul
        className="cand-list"
        ref={listRef}
        data-testid="candidate-list"
        aria-label="Lead candidates"
      >
        {visible.map((c) => (
          <CandidateRow
            key={c.apn}
            candidate={c}
            roofAgeThreshold={props.roofAgeThreshold}
            selected={c.apn === selectedApn}
            checked={checked.has(c.apn)}
            lead={leadByApn.get(c.apn)}
            pending={props.pendingApns.has(c.apn)}
            onCheck={(on) => {
              toggle(c.apn, on);
            }}
            onSelect={() => {
              props.onSelect(c);
            }}
            onDetails={() => {
              props.onDetails(c.apn);
            }}
            onAddLead={() => {
              props.onAddLeads([c]);
            }}
            onOpenLead={props.onOpenLead}
          />
        ))}
      </ul>

      <nav className="pager" aria-label="Candidate pages">
        <button
          type="button"
          className="btn btn-small"
          data-testid="page-prev"
          disabled={safePage === 0}
          onClick={() => {
            setPage(safePage - 1);
          }}
        >
          Previous
        </button>
        <span data-testid="page-status">
          {formatCount(start + 1)}&ndash;{formatCount(start + visible.length)} of{' '}
          {formatCount(candidates.length)}
        </span>
        <button
          type="button"
          className="btn btn-small"
          data-testid="page-next"
          disabled={safePage >= pageCount - 1}
          onClick={() => {
            setPage(safePage + 1);
          }}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
