import type {
  Lead,
  LeadCreate,
  Permit,
  Point,
  PropertyDetail,
  Provenance,
} from '@roofing-crm/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTRPC } from '../lib/api.js';
import {
  bbbSearchUrl,
  describeError,
  formatDate,
  formatDateTime,
  formatOpenDuration,
  hostOf,
  isBulkFileUrl,
  isLongOpen,
  isPossiblyStale,
  permitStatusGroup,
  roofBasisText,
  STALE_HINT,
  statusGroupLabel,
  tidyContractor,
  titleWithUnit,
  unitOf,
  useTypeLabel,
} from '../lib/format.js';
import { leadFromProperty } from '../lib/leadDraft.js';
import { Notice, Spinner } from './fields.js';

export interface PropertyDrawerProps {
  apn: string;
  roofAgeThreshold: number;
  lead: Lead | undefined;
  creating: boolean;
  onClose: () => void;
  onCreateLead: (draft: LeadCreate) => void;
  onOpenLead: (lead: Lead) => void;
  onShowOnMap: (point: Point & { apn: string; label: string | null }) => void;
}

const NOT_IN_SOURCE = 'Not in public source data';

function isHttpUrl(url: string | null): url is string {
  return url !== null && /^https?:\/\//i.test(url);
}

/**
 * Where a record came from. Always rendered, so no figure on screen is unattributed. A link to
 * a whole-dataset download is labelled as such, so nobody starts a 400 MB download by accident.
 */
function SourceLine({ provenance, testId }: { provenance: Provenance; testId: string }) {
  const url = isHttpUrl(provenance.sourceUrl) ? provenance.sourceUrl : null;
  const bulk = url !== null && isBulkFileUrl(url);
  return (
    <p className="source" data-testid={testId}>
      <span className="source-tag">Source</span>{' '}
      {url === null ? (
        provenance.source
      ) : bulk ? (
        <>
          {provenance.source}:{' '}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Opens the whole published dataset, which can be several hundred MB. Find this record in it by the record id."
            data-testid="source-bulk"
          >
            Source dataset (bulk file, {hostOf(url)})
          </a>
        </>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {provenance.source}
        </a>
      )}
      {provenance.sourceRecordId ? ` · record ${provenance.sourceRecordId}` : ''}
      {provenance.fetchedAt ? ` · fetched ${formatDateTime(provenance.fetchedAt)}` : ''}
    </p>
  );
}

function Fact({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  );
}

function BbbCell({ permit }: { permit: Permit }) {
  const c = permit.contractor;
  if (!c) return <span className="muted">No contractor on this permit, so no BBB rating.</span>;
  if (c.bbbRating) {
    return (
      <>
        <strong className="bbb-rating">{c.bbbRating}</strong>
        {isHttpUrl(c.bbbUrl) && (
          <>
            {' '}
            <a href={c.bbbUrl} target="_blank" rel="noopener noreferrer">
              BBB profile
            </a>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <span className="muted">{c.bbbNote ?? 'No BBB rating in the source data.'}</span>
      {c.name && (
        <a
          className="bbb-lookup"
          href={bbbSearchUrl(c.name)}
          target="_blank"
          rel="noopener noreferrer"
          title="Searches bbb.org for this contractor name. A profile or rating may not exist."
          data-testid="bbb-lookup"
        >
          Look up on BBB
        </a>
      )}
    </>
  );
}

/** Status badge and duration line, from the pipeline's status group. */
function PermitStatus({ permit }: { permit: Permit }) {
  const group = permitStatusGroup(
    (permit as { statusGroup?: string | null }).statusGroup ?? (permit.isOpen ? 'open' : null),
  );
  const running = permit.isOpen || group === 'open' || group === 'pending';
  const label = statusGroupLabel(group);
  return (
    <>
      <span
        className={`badge badge-status-${group}${running && isLongOpen(permit.daysOpen) ? ' badge-long' : ''}`}
        data-testid="permit-status-badge"
        data-status-group={group}
      >
        {label}
      </span>
      {permit.status && permit.status.toLowerCase() !== label.toLowerCase() && (
        <div className="muted">Source status: {permit.status}</div>
      )}
      <div className="muted" data-testid="permit-duration">
        {running
          ? formatOpenDuration(permit.daysOpen)
          : permit.closedDate && permit.daysOpen !== null
            ? `closed after ${String(permit.daysOpen)} days`
            : permit.closedDate
              ? 'closed'
              : 'no close date in source'}
      </div>
      {running && isPossiblyStale(permit.daysOpen) && (
        <div className="stale-hint" title={STALE_HINT} data-testid="permit-stale">
          possibly a stale record
        </div>
      )}
    </>
  );
}

function PermitRows({
  permit,
  canCreate,
  creating,
  onCreate,
}: {
  permit: Permit;
  canCreate: boolean;
  creating: boolean;
  onCreate: () => void;
}) {
  const c = permit.contractor;
  const openRoofing = permit.isOpen && permit.isRoofing;
  return (
    <tbody
      className={openRoofing ? 'permit permit-open' : 'permit'}
      data-testid="permit-row"
      data-permit-id={permit.permitId}
    >
      <tr>
        <th scope="row" data-label="Permit no.">
          <span className="permit-id">{permit.permitId}</span>
        </th>
        <td data-label="Type / class">
          {permit.permitType ?? 'Type not recorded'}
          <div className="muted">
            {permit.isRoofing
              ? `Roofing${permit.roofingClass ? `: ${permit.roofingClass}` : ''}`
              : 'Not roofing'}
          </div>
        </td>
        <td data-label="Status">
          <PermitStatus permit={permit} />
        </td>
        <td className="permit-dates" data-label="Dates">
          <div>
            <span className="muted">Applied</span> {formatDate(permit.appliedDate)}
          </div>
          <div>
            <span className="muted">Issued</span> {formatDate(permit.issuedDate)}
          </div>
          <div>
            <span className="muted">Closed</span>{' '}
            {permit.isOpen && !permit.closedDate ? 'Not closed' : formatDate(permit.closedDate)}
          </div>
        </td>
        <td data-testid="permit-contractor" data-label="Contractor">
          {c ? (
            <>
              <div>{c.name ? tidyContractor(c.name) : 'Name not recorded'}</div>
              <div className="muted">
                {c.licenseNumber ? `Lic. ${c.licenseNumber}` : 'No licence number on permit'}
                {c.licenseStatus ? ` · ${c.licenseStatus}` : ''}
              </div>
              {c.classifications && <div className="muted">{c.classifications}</div>}
              {c.phone && <div className="muted">{c.phone}</div>}
            </>
          ) : (
            <span className="muted">No contractor listed (owner-builder or not recorded)</span>
          )}
        </td>
        <td data-testid="permit-bbb" data-label="BBB rating">
          <BbbCell permit={permit} />
        </td>
      </tr>
      <tr className="permit-extra">
        <td colSpan={6}>
          <p className="permit-desc">{permit.description ?? 'No description on the permit.'}</p>
          <div className="permit-foot">
            <SourceLine provenance={permit.provenance} testId="permit-source" />
            {openRoofing && canCreate && (
              <button
                type="button"
                className="btn btn-small btn-primary"
                data-testid="create-lead-from-permit"
                disabled={creating}
                onClick={onCreate}
              >
                Create lead from this permit
              </button>
            )}
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function sortPermits(permits: readonly Permit[]): Permit[] {
  const rank = (p: Permit): number => (p.isOpen && p.isRoofing ? 0 : p.isRoofing ? 1 : 2);
  return [...permits].sort(
    (a, b) => rank(a) - rank(b) || (b.appliedDate ?? '').localeCompare(a.appliedDate ?? ''),
  );
}

function DetailBody(props: PropertyDrawerProps & { detail: PropertyDetail }) {
  const { detail, lead } = props;
  const permits = sortPermits(detail.permits);
  const useType = useTypeLabel(detail.useType);
  const occupied =
    detail.ownerOccupied === null
      ? NOT_IN_SOURCE
      : detail.ownerOccupied
        ? 'Yes'
        : 'No (absentee owner)';

  return (
    <>
      <div className="drawer-actions">
        {lead ? (
          <button
            key="open"
            type="button"
            className="btn btn-done"
            data-testid="drawer-open-lead"
            onClick={() => {
              props.onOpenLead(lead);
            }}
          >
            Lead &#10003; &middot; Open lead
          </button>
        ) : (
          <button
            key="create"
            type="button"
            className="btn btn-primary"
            data-testid="create-lead-from-property"
            disabled={props.creating}
            onClick={() => {
              props.onCreateLead(leadFromProperty(detail, props.roofAgeThreshold));
            }}
          >
            {props.creating ? 'Creating…' : 'Create lead from this property'}
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-testid="drawer-show-on-map"
          onClick={() => {
            props.onShowOnMap({
              apn: detail.apn,
              lat: detail.lat,
              lon: detail.lon,
              label: detail.address,
            });
          }}
        >
          Show on map
        </button>
      </div>

      <section aria-labelledby="drawer-roof">
        <h3 id="drawer-roof">Property and roof</h3>
        <dl className="facts">
          <Fact label="APN" testId="detail-apn">
            {detail.apn}
          </Fact>
          <Fact label="Roof age" testId="detail-roof-age">
            {detail.roofAgeYears === null
              ? 'Unknown'
              : `About ${String(detail.roofAgeYears)} years`}
          </Fact>
          <Fact label="Roof year">{detail.roofYear ?? 'Unknown'}</Fact>
          <Fact label="Basis" testId="detail-roof-basis">
            {roofBasisText(detail.roofBasis, detail.roofYear)}
          </Fact>
          <Fact label="Confidence">{detail.roofConfidence ?? 'Not rated'}</Fact>
          <Fact label="Assessor effective year">{detail.yearBuilt ?? NOT_IN_SOURCE}</Fact>
          <Fact label="Use type">
            {useType ? (
              <span title={useType.hint ?? undefined}>{useType.text}</span>
            ) : (
              NOT_IN_SOURCE
            )}
          </Fact>
          {unitOf(detail) && <Fact label="Unit">{unitOf(detail)}</Fact>}
          <Fact label="Coordinates">
            {detail.lat.toFixed(5)}, {detail.lon.toFixed(5)}
          </Fact>
        </dl>
        <SourceLine provenance={detail.provenance} testId="property-source" />
      </section>

      <section aria-labelledby="drawer-owner">
        <h3 id="drawer-owner">Ownership</h3>
        <dl className="facts" data-testid="ownership">
          <Fact label="Owner-occupied">{occupied}</Fact>
          <Fact label="Last transfer">
            {detail.lastTransferDate ? formatDate(detail.lastTransferDate) : NOT_IN_SOURCE}
          </Fact>
          <Fact label="Years since transfer">{detail.yearsSinceTransfer ?? NOT_IN_SOURCE}</Fact>
          <Fact label="Owner name" testId="detail-owner-name">
            {detail.ownerName ?? NOT_IN_SOURCE}
          </Fact>
          <Fact label="Mailing address">{detail.ownerMailing ?? NOT_IN_SOURCE}</Fact>
        </dl>
      </section>

      <section aria-labelledby="drawer-permits">
        <h3 id="drawer-permits">Permits ({permits.length})</h3>
        {permits.length === 0 ? (
          <p className="muted" data-testid="no-permits">
            No permits for this property in the source data.
          </p>
        ) : (
          <div className="table-scroll">
            <table className="permits" data-testid="permits-table">
              <thead>
                <tr>
                  <th scope="col">Permit no.</th>
                  <th scope="col">Type / roofing class</th>
                  <th scope="col">Status / open duration</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Contractor / licence</th>
                  <th scope="col">BBB rating</th>
                </tr>
              </thead>
              {permits.map((permit) => (
                <PermitRows
                  key={permit.permitId}
                  permit={permit}
                  canCreate={!lead}
                  creating={props.creating}
                  onCreate={() => {
                    props.onCreateLead(leadFromProperty(detail, props.roofAgeThreshold, permit));
                  }}
                />
              ))}
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** Side panel with everything known about one property, and the ways to turn it into a lead. */
export function PropertyDrawer(props: PropertyDrawerProps) {
  const trpc = useTRPC();
  const query = useQuery(trpc.property.detail.queryOptions({ apn: props.apn }));
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { onClose } = props;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Move focus into the drawer when it opens or switches property; Escape closes it.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [props.apn]);

  const detail = query.data;
  return (
    <aside
      className="drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="drawer-title"
      data-testid="property-drawer"
    >
      <header className="drawer-head">
        <div>
          <p className="eyebrow">Property</p>
          <h2 id="drawer-title" data-testid="drawer-title">
            {detail ? titleWithUnit(detail.address, detail.apn, detail) : `APN ${props.apn}`}
          </h2>
          {detail && (
            <p className="muted">{[detail.city, 'CA', detail.zip].filter(Boolean).join(' ')}</p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-quiet"
          ref={closeRef}
          data-testid="drawer-close"
          onClick={onClose}
        >
          Close <span aria-hidden="true">&times;</span>
        </button>
      </header>
      <div className="drawer-body">
        {query.isLoading && <Spinner label="Loading property…" />}
        {query.error && (
          <Notice
            kind="error"
            testId="drawer-error"
            action={
              <button
                type="button"
                className="btn btn-small"
                data-testid="drawer-retry"
                onClick={() => {
                  void query.refetch();
                }}
              >
                Retry
              </button>
            }
          >
            <strong>Could not load this property.</strong> {describeError(query.error)}
          </Notice>
        )}
        {detail && <DetailBody {...props} detail={detail} />}
      </div>
    </aside>
  );
}
