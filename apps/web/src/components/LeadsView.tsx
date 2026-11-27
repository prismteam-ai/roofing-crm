import {
  leadPrioritySchema,
  leadStatusSchema,
  type Lead,
  type LeadFilter,
  type LeadStatus,
  type Point,
} from '@roofing-crm/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { getWorkspaceId, useTRPC } from '../lib/api.js';
import { downloadText, leadsToCsv } from '../lib/csv.js';
import {
  addressLine,
  describeError,
  formatDateTime,
  formatOpenDuration,
  formatShortDateTime,
  isLongOpen,
  roofAgeText,
  roofBasisText,
} from '../lib/format.js';
import type { LeadBook } from '../lib/useLeadBook.js';
import { MIN_OPEN_YEAR_CHOICES, type LeadFilters } from '../lib/urlState.js';
import { Notice, NumberField, SelectField, Spinner } from './fields.js';

export interface LeadsViewProps {
  filters: LeadFilters;
  pin: Point | null;
  book: LeadBook;
  highlightLeadId: string | null;
  onFilters: (patch: Partial<LeadFilters>) => void;
  onOpenProperty: (apn: string) => void;
  onShowOnMap: (lead: Lead) => void;
  onGoToMap: () => void;
}

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_FILTER = [
  { value: 'all', label: 'All statuses' },
  ...leadStatusSchema.options.map((status) => ({ value: status, label: STATUS_LABEL[status] })),
];
const PERMIT_FILTER = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Has open permit' },
  { value: 'no', label: 'No open permit' },
] as const;
const OPEN_FILTER = MIN_OPEN_YEAR_CHOICES.map((years) => ({
  value: String(years),
  label: years === 0 ? 'Any length' : `${String(years)}+ yrs`,
}));

/** Turns the on-screen filters into the API's lead filter. */
export function toLeadFilter(filters: LeadFilters, pin: Point | null): LeadFilter {
  const out: LeadFilter = {};
  if (filters.status) out.status = filters.status;
  if (filters.minRoofAgeYears !== null) out.minRoofAgeYears = Math.round(filters.minRoofAgeYears);
  if (filters.hasOpenPermit !== null) out.hasOpenPermit = filters.hasOpenPermit;
  if (filters.minOpenYears !== null && filters.minOpenYears > 0)
    out.minOpenYears = filters.minOpenYears;
  if (filters.withinMiles !== null && pin) {
    out.near = pin;
    out.radiusMiles = filters.withinMiles;
  }
  return out;
}

interface LeadRowProps {
  lead: Lead;
  highlighted: boolean;
  book: LeadBook;
  onOpenProperty: (apn: string) => void;
  onShowOnMap: (lead: Lead) => void;
}

function LeadRow({ lead, highlighted, book, onOpenProperty, onShowOnMap }: LeadRowProps) {
  const [assignee, setAssignee] = useState(lead.assignee ?? '');
  const [notes, setNotes] = useState(lead.notes);
  const [confirming, setConfirming] = useState(false);
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const address = addressLine(lead.address, lead.apn);

  // Server (or rollback) changed the value: show it.
  useEffect(() => {
    setAssignee(lead.assignee ?? '');
  }, [lead.assignee]);
  useEffect(() => {
    setNotes(lead.notes);
  }, [lead.notes]);

  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  const saveAssignee = (): void => {
    const next = assignee.trim() === '' ? null : assignee.trim();
    if (next !== lead.assignee) book.update({ leadId: lead.leadId, assignee: next });
  };
  const saveNotes = (): void => {
    if (notes !== lead.notes) book.update({ leadId: lead.leadId, notes });
  };

  return (
    <tr
      ref={rowRef}
      className={highlighted ? 'is-highlighted' : undefined}
      data-testid="lead-row"
      data-lead-id={lead.leadId}
      data-apn={lead.apn}
    >
      <td data-label="Property">
        <button
          type="button"
          className="link-btn lead-address"
          data-testid="lead-open-property"
          onClick={() => {
            onOpenProperty(lead.apn);
          }}
        >
          {address}
        </button>
        <div className="muted">
          {lead.city ?? ''} &middot; APN {lead.apn}
        </div>
        {lead.permitId && <div className="muted">From permit {lead.permitId}</div>}
      </td>
      <td data-label="Why it is a lead" data-testid="lead-signal">
        <div>
          {roofAgeText(lead.signal.roofAgeYears)}{' '}
          <span className="muted">({roofBasisText(lead.signal.roofBasis, null)})</span>
        </div>
        {lead.signal.openRoofPermits > 0 ? (
          <span
            className={`badge badge-permit${isLongOpen(lead.signal.longestOpenDays) ? ' badge-long' : ''}`}
          >
            Open permit &middot; {formatOpenDuration(lead.signal.longestOpenDays)}
          </span>
        ) : (
          <span className="muted">No open roofing permit</span>
        )}
        <div className="muted">Score {lead.signal.score}</div>
      </td>
      <td data-label="Status / priority" className="lead-stage">
        <select
          value={lead.status}
          aria-label={`Status for ${address}`}
          className={`status status-${lead.status}`}
          data-testid="lead-status"
          onChange={(event) => {
            const status = leadStatusSchema.safeParse(event.target.value);
            if (status.success) book.update({ leadId: lead.leadId, status: status.data });
          }}
        >
          {leadStatusSchema.options.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select
          value={lead.priority}
          aria-label={`Priority for ${address}`}
          data-testid="lead-priority"
          onChange={(event) => {
            const priority = leadPrioritySchema.safeParse(event.target.value);
            if (priority.success) book.update({ leadId: lead.leadId, priority: priority.data });
          }}
        >
          {leadPrioritySchema.options.map((priority) => (
            <option key={priority} value={priority}>
              {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
            </option>
          ))}
        </select>
      </td>
      <td data-label="Assignee">
        <input
          type="text"
          value={assignee}
          maxLength={80}
          placeholder="Unassigned"
          aria-label={`Assignee for ${address}`}
          data-testid="lead-assignee"
          onChange={(event) => {
            setAssignee(event.target.value);
          }}
          onBlur={saveAssignee}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
      </td>
      <td data-label="Notes">
        <textarea
          value={notes}
          rows={2}
          maxLength={4000}
          placeholder="Add a note"
          aria-label={`Notes for ${address}`}
          data-testid="lead-notes"
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          onBlur={saveNotes}
        />
      </td>
      <td data-label="Created / updated" className="lead-dates">
        <div title={`Created ${formatDateTime(lead.createdAt)}`}>
          {formatShortDateTime(lead.createdAt)}
        </div>
        <div className="muted" title={`Updated ${formatDateTime(lead.updatedAt)}`}>
          upd. {formatShortDateTime(lead.updatedAt)}
        </div>
      </td>
      <td data-label="Actions" className="lead-actions">
        {confirming ? (
          <div
            className="confirm"
            role="group"
            aria-label={`Confirm delete of ${address}`}
            data-testid="lead-delete-confirm"
          >
            <span>Delete this lead?</span>
            <button
              type="button"
              className="btn btn-small btn-danger"
              data-testid="lead-delete-yes"
              onClick={() => {
                book.remove(lead.leadId);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn btn-small"
              data-testid="lead-delete-no"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-small"
              data-testid="lead-show-on-map"
              onClick={() => {
                onShowOnMap(lead);
              }}
            >
              Show on map
            </button>
            <button
              type="button"
              className="btn btn-small btn-quiet-danger"
              aria-label={`Delete lead ${address}`}
              data-testid="lead-delete"
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

/** The CRM's lead records: filter, edit in place, delete, export. */
export function LeadsView(props: LeadsViewProps) {
  const { filters, pin, book } = props;
  const trpc = useTRPC();
  const query = useQuery(
    trpc.leads.list.queryOptions(toLeadFilter(filters, pin), { placeholderData: keepPreviousData }),
  );
  const leads = query.data?.leads ?? [];
  const total = query.data?.total ?? 0;
  const filtered = leads.length !== total;

  return (
    <div className="page leads" data-testid="leads-view">
      <div className="page-head">
        <div>
          <h2>Leads</h2>
          <p className="muted" data-testid="workspace-note">
            Leads are stored per browser workspace (no login). This browser&rsquo;s workspace:{' '}
            <code>{getWorkspaceId().slice(0, 11)}&hellip;</code>
          </p>
        </div>
        <button
          type="button"
          className="btn"
          data-testid="export-csv"
          disabled={leads.length === 0}
          onClick={() => {
            const day = new Date().toISOString().slice(0, 10);
            downloadText(`roofing-leads-${day}.csv`, leadsToCsv(leads), 'text/csv;charset=utf-8');
          }}
        >
          Export CSV ({leads.length})
        </button>
      </div>

      <form
        className="controls leads-filters"
        aria-label="Lead filters"
        data-testid="lead-filters"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="controls-row">
          <SelectField
            label="Status"
            value={filters.status ?? 'all'}
            options={STATUS_FILTER}
            testId="lead-filter-status"
            onChange={(value) => {
              const status = leadStatusSchema.safeParse(value);
              props.onFilters({ status: status.success ? status.data : null });
            }}
          />
          <NumberField
            label="Roof age at least"
            className="field-narrow"
            value={filters.minRoofAgeYears}
            min={0}
            max={150}
            step={1}
            integer
            allowEmpty
            placeholder="Any"
            suffix="yrs"
            testId="lead-filter-roof-age"
            onCommit={(minRoofAgeYears) => {
              props.onFilters({ minRoofAgeYears });
            }}
          />
          <SelectField
            label="Open roofing permit"
            value={filters.hasOpenPermit === null ? 'any' : filters.hasOpenPermit ? 'yes' : 'no'}
            options={PERMIT_FILTER}
            testId="lead-filter-permit"
            onChange={(value) => {
              props.onFilters({ hasOpenPermit: value === 'any' ? null : value === 'yes' });
            }}
          />
          <SelectField
            label="Permit open at least"
            value={String(filters.minOpenYears ?? 0)}
            options={OPEN_FILTER}
            testId="lead-filter-open-years"
            onChange={(value) => {
              props.onFilters({ minOpenYears: Number(value) === 0 ? null : Number(value) });
            }}
          />
          <NumberField
            label="Within miles of current pin"
            className="field-narrow"
            value={filters.withinMiles}
            min={0.1}
            max={25}
            step={0.5}
            allowEmpty
            disabled={!pin}
            placeholder={pin ? 'Any' : 'No pin'}
            suffix="mi"
            testId="lead-filter-miles"
            onCommit={(withinMiles) => {
              props.onFilters({ withinMiles });
            }}
          />
          <div className="controls-actions">
            <button
              type="button"
              className="btn btn-quiet"
              data-testid="lead-filters-clear"
              onClick={() => {
                props.onFilters({
                  status: null,
                  minRoofAgeYears: null,
                  hasOpenPermit: null,
                  minOpenYears: null,
                  withinMiles: null,
                });
              }}
            >
              Clear filters
            </button>
          </div>
        </div>
        <p className="muted filter-hint">
          {pin
            ? `Distance is measured from the map pin at ${String(pin.lat)}, ${String(pin.lon)}.`
            : 'Drop a pin on the Lead Map to filter leads by distance.'}
        </p>
      </form>

      <p className="result-count" data-testid="lead-count" aria-live="polite">
        {query.isLoading
          ? 'Loading leads…'
          : filtered
            ? `${String(leads.length)} of ${String(total)} leads match the filters`
            : `${String(total)} ${total === 1 ? 'lead' : 'leads'}`}
      </p>

      {query.error ? (
        <Notice
          kind="error"
          testId="leads-error"
          action={
            <button
              type="button"
              className="btn btn-small"
              data-testid="leads-retry"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry
            </button>
          }
        >
          <strong>Could not load leads.</strong> {describeError(query.error)}
        </Notice>
      ) : query.isLoading ? (
        <div className="empty">
          <Spinner label="Loading leads…" />
        </div>
      ) : total === 0 ? (
        <div className="empty" data-testid="leads-empty">
          <h3>No leads yet</h3>
          <p>
            Find properties on the Lead Map and press <strong>Add lead</strong>, or tick several and
            use <strong>Convert selected to leads</strong>.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="leads-go-map"
            onClick={props.onGoToMap}
          >
            Go to Lead Map
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div className="empty" data-testid="leads-empty-filtered">
          <h3>No leads match these filters</h3>
          <p>Loosen or clear the filters to see all {total} leads.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="leads-table" data-testid="leads-table">
            <thead>
              <tr>
                <th scope="col">Property</th>
                <th scope="col">Why it is a lead</th>
                <th scope="col">Status / priority</th>
                <th scope="col">Assignee</th>
                <th scope="col">Notes</th>
                <th scope="col">Created / updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead.leadId}
                  lead={lead}
                  highlighted={lead.leadId === props.highlightLeadId}
                  book={book}
                  onOpenProperty={props.onOpenProperty}
                  onShowOnMap={props.onShowOnMap}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
