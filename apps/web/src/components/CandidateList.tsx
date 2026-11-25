import {
  MAX_RADIUS_MILES,
  type Candidate,
  type Lead,
  type SearchResult,
} from '@roofing-crm/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  candidateKind,
  formatCount,
  formatMiles,
  formatOpenDuration,
  isLongOpen,
  isPossiblyStale,
  STALE_HINT,
  tidyContractor,
  roofAgeText,
  roofBasisText,
  titleWithUnit,
  useTypeLabel,
} from '../lib/format.js';
import type { SearchFilters } from '../lib/urlState.js';
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
  filters: SearchFilters;
  radiusMiles: number;
  onShowAged: () => void;
  onWidenRadius: (miles: number) => void;
  onResetFilters: () => void;
}

/** True when the current filters can only match properties that have permit records. */
export function permitFilterActive(filters: SearchFilters): boolean {
  return (
    filters.signal === 'open_permit' ||
    filters.signal === 'both' ||
    filters.permitStatus !== 'any' ||
    filters.minOpenYears > 0
  );
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
  const address = titleWithUnit(c.address, c.apn, c);
  const useType = useTypeLabel(c.useType);
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
          {[c.city, c.zip].filter(Boolean).join(' ')} &middot; {formatMiles(c.distanceMiles)}{' '}
          &middot;{' '}
          <span className="cand-apn" data-testid="candidate-apn">
            APN {c.apn}
          </span>
          {useType && (
            <>
              {' '}
              &middot;{' '}
              <span className="cand-use" title={useType.hint ?? undefined}>
                {useType.text}
              </span>
            </>
          )}
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
          {c.openRoofPermits > 0 && (c.topOpenPermitId || isPossiblyStale(c.longestOpenDays)) && (
            <span className="cand-permit-line muted" data-testid="candidate-permit-detail">
              {c.topOpenPermitId && (
                <>
                  Permit {c.topOpenPermitId} &middot;{' '}
                  {c.topOpenContractor
                    ? tidyContractor(c.topOpenContractor)
                    : 'no contractor listed'}
                  {c.topOpenLicenseNo ? ` · Lic. ${c.topOpenLicenseNo}` : ''}
                </>
              )}
              {isPossiblyStale(c.longestOpenDays) && (
                <span className="stale-hint" title={STALE_HINT} data-testid="candidate-stale">
                  possibly a stale record
                </span>
              )}
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

export interface CandidateGroup {
  /** APN of the first member: stable for a given result order. */
  key: string;
  address: string | null;
  members: Candidate[];
}

/**
 * Condo towers come back as one row per unit with the same street address. Consecutive rows
 * that share an address become one group, best score first, so 40 identical-looking rows read
 * as "700 FRONT ST · 40 units". Rows without an address are never grouped.
 */
export function groupCandidates(candidates: readonly Candidate[]): CandidateGroup[] {
  const groups: CandidateGroup[] = [];
  for (const c of candidates) {
    const last = groups.at(-1);
    const first = last?.members[0];
    if (
      last &&
      first &&
      c.address !== null &&
      first.address === c.address &&
      first.city === c.city
    ) {
      last.members.push(c);
    } else {
      groups.push({ key: c.apn, address: c.address, members: [c] });
    }
  }
  for (const group of groups) {
    if (group.members.length > 1) {
      group.members.sort((a, b) => b.score - a.score || a.apn.localeCompare(b.apn));
    }
  }
  return groups;
}

interface GroupRowProps {
  group: CandidateGroup;
  roofAgeThreshold: number;
  expanded: boolean;
  checkedCount: number;
  leadCount: number;
  pending: boolean;
  onToggle: () => void;
  onCheckAll: (checked: boolean) => void;
  onAddAll: () => void;
  children: ReactNode;
}

function GroupRow(props: GroupRowProps) {
  const { group, expanded } = props;
  const units = group.members;
  const best = units[0];
  const checkRef = useRef<HTMLInputElement | null>(null);
  const some = props.checkedCount > 0 && props.checkedCount < units.length;
  useEffect(() => {
    if (checkRef.current) checkRef.current.indeterminate = some;
  }, [some]);
  if (!best) return null;

  const address = group.address ?? `APN ${best.apn}`;
  const ages = units.flatMap((c) => (c.roofAgeYears === null ? [] : [c.roofAgeYears]));
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);
  const withPermit = units.filter((c) => c.openRoofPermits > 0).length;
  const toAdd = units.length - props.leadCount;

  return (
    <li
      className={`cand-group${expanded ? ' is-open' : ''}`}
      data-testid="candidate-group"
      data-address={address}
      data-units={units.length}
    >
      <div className={`cand kind-${candidateKind(best, props.roofAgeThreshold)}`}>
        <input
          type="checkbox"
          className="cand-check"
          ref={checkRef}
          checked={props.checkedCount === units.length}
          aria-label={`Select all ${String(units.length)} units at ${address} for bulk convert`}
          data-testid="group-check"
          onChange={(event) => {
            props.onCheckAll(event.target.checked);
          }}
        />
        <div className="cand-main">
          <button
            type="button"
            className="cand-title"
            aria-expanded={expanded}
            data-testid="group-toggle"
            onClick={props.onToggle}
          >
            {address} <span className="group-count">&middot; {units.length} units</span>
          </button>
          <div className="cand-sub">
            {[best.city, best.zip].filter(Boolean).join(' ')} &middot;{' '}
            {formatMiles(best.distanceMiles)} &middot; {units.length} separate parcels at this
            address
          </div>
          <div className="cand-signals">
            <span className="cand-roof">
              <strong>
                {ages.length === 0
                  ? 'Roof age unknown'
                  : minAge === maxAge
                    ? roofAgeText(minAge)
                    : `Roofs ~${String(minAge)} to ${String(maxAge)} yrs`}
              </strong>
            </span>
            {withPermit > 0 && (
              <span className="badge badge-permit">{withPermit} with an open roofing permit</span>
            )}
            {props.leadCount > 0 && (
              <span className="muted">
                {props.leadCount} of {units.length} already leads
              </span>
            )}
          </div>
        </div>
        <div className="cand-side">
          <span
            className={`score score-static score-${best.score >= 60 ? 'high' : best.score >= 30 ? 'mid' : 'low'}`}
          >
            <span className="score-label">Best</span> {best.score}
          </span>
          <div className="cand-actions">
            <button
              type="button"
              className="btn btn-small"
              aria-expanded={expanded}
              data-testid="group-expand"
              onClick={props.onToggle}
            >
              {expanded ? 'Hide units' : 'Show units'}
            </button>
            <button
              type="button"
              className="btn btn-small btn-primary"
              data-testid="group-add-all"
              disabled={toAdd === 0 || props.pending}
              onClick={props.onAddAll}
            >
              {toAdd === 0
                ? 'All are leads \u2713'
                : props.pending
                  ? 'Adding\u2026'
                  : `Add all ${String(toAdd)} as leads`}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <ul className="cand-units" aria-label={`Units at ${address}`} data-testid="group-units">
          {props.children}
        </ul>
      )}
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

  const groups = useMemo(() => groupCandidates(candidates), [candidates]);
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());

  // Paging counts rows on screen (a group is one row), not properties.
  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const visibleGroups = groups.slice(start, start + PAGE_SIZE);
  const visible = visibleGroups.flatMap((group) => group.members);

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
    const index = groups.findIndex((group) => group.members.some((c) => c.apn === selectedApn));
    const group = groups[index];
    if (!group) return;
    setPage(Math.floor(index / PAGE_SIZE));
    // A unit picked on the map sits inside a collapsed group: open it so the row exists.
    if (group.members.length > 1) {
      setOpenGroups((current) =>
        current.has(group.key) ? current : new Set([...current, group.key]),
      );
    }
    const frame = window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-apn="${CSS.escape(selectedApn)}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedApn, groups]);

  const convertible = candidates.filter((c) => checked.has(c.apn) && !leadByApn.has(c.apn));
  const pageAllChecked = visible.length > 0 && visible.every((c) => checked.has(c.apn));

  const toggle = (apns: readonly string[], on: boolean): void => {
    setChecked((current) => {
      const next = new Set(current);
      for (const apn of apns) {
        if (on) next.add(apn);
        else next.delete(apn);
      }
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
    if (result.coverageNote && permitFilterActive(props.filters)) {
      return (
        <div className="empty" data-testid="list-empty-coverage">
          <h3>No permit matches here, and that is expected</h3>
          <p>Your filters only match properties with permit records. {result.coverageNote}</p>
          <p>Roof age is still known for these properties.</p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="empty-show-aged"
            onClick={props.onShowAged}
          >
            Show aged roofs here instead
          </button>
        </div>
      );
    }
    const wider = Math.min(MAX_RADIUS_MILES, Math.max(props.radiusMiles * 2, 1));
    return (
      <div className="empty" data-testid="list-empty">
        <h3>No matches in this area</h3>
        <p>Nothing inside the {props.radiusMiles}-mile radius meets the current filters.</p>
        <div className="empty-actions">
          {wider > props.radiusMiles && (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="empty-widen"
              onClick={() => {
                props.onWidenRadius(wider);
              }}
            >
              Widen radius to {wider} mi
            </button>
          )}
          {permitFilterActive(props.filters) && (
            <button
              type="button"
              className="btn"
              data-testid="empty-show-aged"
              onClick={props.onShowAged}
            >
              Show aged roofs here instead
            </button>
          )}
          <button
            type="button"
            className="btn"
            data-testid="empty-reset"
            onClick={props.onResetFilters}
          >
            Reset filters
          </button>
        </div>
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
          <strong>
            Top {formatCount(candidates.length)} of {formatCount(result.total)} shown
          </strong>{' '}
          (list and map). Narrow the radius or filters to see the rest.
        </p>
      )}

      <ul
        className="cand-list"
        ref={listRef}
        data-testid="candidate-list"
        aria-label="Lead candidates"
      >
        {visibleGroups.map((group) => {
          const rows = group.members.map((c) => (
            <CandidateRow
              key={c.apn}
              candidate={c}
              roofAgeThreshold={props.roofAgeThreshold}
              selected={c.apn === selectedApn}
              checked={checked.has(c.apn)}
              lead={leadByApn.get(c.apn)}
              pending={props.pendingApns.has(c.apn)}
              onCheck={(on) => {
                toggle([c.apn], on);
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
          ));
          if (group.members.length === 1) return rows;
          const apns = group.members.map((c) => c.apn);
          return (
            <GroupRow
              key={`group-${group.key}`}
              group={group}
              roofAgeThreshold={props.roofAgeThreshold}
              expanded={openGroups.has(group.key)}
              checkedCount={apns.filter((apn) => checked.has(apn)).length}
              leadCount={apns.filter((apn) => leadByApn.has(apn)).length}
              pending={apns.some((apn) => props.pendingApns.has(apn))}
              onToggle={() => {
                setOpenGroups((current) => {
                  const next = new Set(current);
                  if (!next.delete(group.key)) next.add(group.key);
                  return next;
                });
              }}
              onCheckAll={(on) => {
                toggle(apns, on);
              }}
              onAddAll={() => {
                props.onAddLeads(group.members.filter((c) => !leadByApn.has(c.apn)));
              }}
            >
              {rows}
            </GroupRow>
          );
        })}
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
          {formatCount(start + 1)}&ndash;{formatCount(start + visibleGroups.length)} of{' '}
          {formatCount(groups.length)}
          {groups.length !== candidates.length
            ? ` rows (${formatCount(candidates.length)} properties)`
            : ''}
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
