import { formatOpenDuration, type Property } from '@roofing/shared';
import { bbbLabel } from '@roofing/shared';
import { fmtDate, fmtMoney, fmtRoofAge } from '../lib/ui.js';

interface Props {
  property: Property;
  onClose: () => void;
  onAddLead: (p: Property, permitId: string | null) => void;
}

export function PropertyDrawer({ property: p, onClose, onAddLead }: Props) {
  const roofing = p.permits.filter((x) => x.is_roofing);
  const other = p.permits.filter((x) => !x.is_roofing);
  return (
    <aside className="drawer" data-testid="property-drawer" aria-label="Property details">
      <header>
        <h2>{p.address ?? 'address unknown'}</h2>
        <button type="button" onClick={onClose} aria-label="Close" data-testid="drawer-close">
          ×
        </button>
      </header>
      <div className="drawer-body">
        <dl>
          <dt>PIN</dt>
          <dd data-testid="drawer-pin">{p.pin14}</dd>
          <dt>City</dt>
          <dd>
            {p.city ?? 'unknown'} {p.zip ?? ''}{' '}
            {p.municipality && p.municipality !== p.city ? `(${p.municipality})` : ''}
          </dd>
          <dt>Year built</dt>
          <dd>{p.year_built ?? 'unknown'}</dd>
          <dt>Roof age</dt>
          <dd data-testid="drawer-roof-age">{fmtRoofAge(p)}</dd>
          <dt>Last sale</dt>
          <dd>
            {fmtDate(p.last_sale_date)}{' '}
            {p.last_sale_price !== null && `· ${fmtMoney(p.last_sale_price)}`}
          </dd>
          <dt>Owner</dt>
          <dd>{p.owner_name ?? 'unknown'}</dd>
          <dt>Owner mailing</dt>
          <dd>
            {p.mail_address
              ? `${p.mail_address}, ${p.mail_city ?? ''} ${p.mail_state ?? ''} ${p.mail_zip ?? ''}`
              : 'unknown'}
            {p.is_out_of_area && (
              <span className="badge warn" data-testid="out-of-area-badge">
                out-of-area owner
              </span>
            )}
          </dd>
          <dt>Source</dt>
          <dd>
            {p.source_url ? (
              <a
                href={p.source_url}
                target="_blank"
                rel="noreferrer"
                data-testid="property-source-link"
              >
                parcel record
              </a>
            ) : (
              'n/a'
            )}{' '}
            · ingested {fmtDate(p.ingested_at)}
          </dd>
        </dl>
        <button
          type="button"
          className="primary"
          onClick={() => onAddLead(p, null)}
          data-testid="add-lead"
        >
          Add to leads
        </button>

        <h3>Roofing permits ({roofing.length})</h3>
        {roofing.length === 0 && (
          <p className="muted">No roofing permits on record for this PIN.</p>
        )}
        {roofing.map((x) => (
          <article
            key={x.permit_id}
            className={x.status_is_open ? 'permit open' : 'permit'}
            data-testid="permit-card"
            data-open={x.status_is_open}
          >
            <div className="permit-head">
              <strong>{x.permit_id}</strong>
              <span
                className={x.status_is_open ? 'badge open' : 'badge'}
                data-testid="permit-status"
              >
                {x.status ?? 'unknown'} ·{' '}
                {x.status_is_open ? `open ${formatOpenDuration(x.open_days)}` : 'closed'}
              </span>
            </div>
            <p className="desc">{x.work_description}</p>
            <dl className="compact">
              <dt>Issued</dt>
              <dd>
                {fmtDate(x.issued_at)}
                {x.closed_at && ` · closed ${fmtDate(x.closed_at)}`}
              </dd>
              <dt>Contractor</dt>
              <dd data-testid="permit-contractor">
                {x.contractor_name ?? 'not listed'}
                {x.contractor && (
                  <span data-testid="permit-license">
                    {' '}
                    · license {x.contractor.license_number ?? 'number unknown'} (
                    {x.contractor.license_status ?? 'status unknown'})
                  </span>
                )}
                {x.contractor?.ever_disciplined && <span className="badge warn">disciplined</span>}
              </dd>
              <dt>BBB</dt>
              <dd data-testid="permit-bbb">
                {bbbLabel(x.contractor)}
                {x.contractor?.bbb_rating && x.contractor.bbb_url && (
                  <>
                    {' '}
                    ·{' '}
                    <a
                      href={x.contractor.bbb_url}
                      target="_blank"
                      rel="noreferrer"
                      data-testid="permit-bbb-link"
                    >
                      BBB profile
                    </a>
                  </>
                )}
              </dd>
              <dt>Source</dt>
              <dd>
                {x.source_url ? (
                  <a
                    href={x.source_url}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="permit-source-link"
                  >
                    {x.source_system}
                  </a>
                ) : (
                  x.source_system
                )}{' '}
                · ingested {fmtDate(x.ingested_at)}
              </dd>
            </dl>
            <button
              type="button"
              onClick={() => onAddLead(p, x.permit_id)}
              data-testid="add-lead-permit"
            >
              Add to leads with this permit
            </button>
          </article>
        ))}
        {other.length > 0 && (
          <details>
            <summary>Other permits ({other.length})</summary>
            {other.map((x) => (
              <p key={x.permit_id} className="muted">
                {x.permit_id} · {x.status} · {x.work_description}
              </p>
            ))}
          </details>
        )}
      </div>
    </aside>
  );
}
