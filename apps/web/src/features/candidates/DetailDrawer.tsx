import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { basisLabel, gatewayUrl, openFor, shortCid } from "../../lib/format.ts";
import { type Outputs, useTRPC } from "../../lib/trpc.ts";

type PermitSummary = Outputs["property"]["get"]["permits"][number];

function Ext({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

function Bbb({ rating, accredited }: { rating: string | null | undefined; accredited?: string | null }) {
  if (!rating) return <span className="muted">No BBB data</span>;
  return (
    <span>
      BBB {rating}
      {accredited ? ` · ${/^(y|yes|true|accredited)$/i.test(accredited) ? "accredited" : accredited}` : ""}
    </span>
  );
}

/** One roofing permit with its contractor, license and BBB facts (from permit.get). */
function PermitCard({ p }: { p: PermitSummary }) {
  const trpc = useTRPC();
  const q = useQuery(trpc.permit.get.queryOptions({ id: p.permit_key }));
  const d = q.data?.permit;
  const contractor = q.data?.contractor;
  return (
    <li className="permit-card" data-testid={`permit-${p.permit_key}`}>
      <div>
        <strong>{p.permit_number ?? p.permit_key}</strong> · {p.status}
        {p.raw_status && p.raw_status !== p.status ? <span className="muted"> ({p.raw_status})</span> : null}
        {p.status === "open" ? <span> · {openFor(p.open_days)}</span> : null}
      </div>
      <div className="muted">
        {p.description ?? p.permit_type ?? "roofing"} · issued {p.issue_date ?? "—"}
        {p.completion_date ? ` · completed ${p.completion_date}` : ""}
      </div>
      <div>
        Contractor:{" "}
        {p.contractor_name ?? contractor?.contractor_name ?? <span className="muted">not on the permit</span>}
        {p.contractor_license ? <span className="muted"> · license {p.contractor_license}</span> : null}
        {d?.contractor_license_status ? (
          <span className="muted"> ({d.contractor_license_status})</span>
        ) : null}
      </div>
      <div>
        <Bbb
          rating={d?.bbb_rating ?? contractor?.bbb_rating}
          accredited={d?.bbb_accredited ?? contractor?.bbb_accredited}
        />
      </div>
      <div className="links">
        <Ext href={p.source_url}>Permit source</Ext>
        <Ext href={contractor?.source_url}>DBPR license</Ext>
        {d?.property_improvement_cid ? (
          <Ext href={gatewayUrl(d.property_improvement_cid)}>Permit record (IPFS)</Ext>
        ) : null}
      </div>
    </li>
  );
}

export function DetailDrawer({ propertyId, onClose }: { propertyId: string; onClose(): void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const q = useQuery(trpc.property.get.queryOptions({ id: propertyId }));
  const create = useMutation({
    ...trpc.leads.create.mutationOptions(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.leads.list.pathKey() }),
  });
  const snap = useQuery(trpc.meta.snapshot.queryOptions());
  const d = q.data;
  const p = d?.property;
  const roofing = (d?.permits ?? []).filter((x) => x.is_roofing);
  const openLongest = [...roofing]
    .filter((x) => x.status === "open")
    .sort((a, b) => (b.open_days ?? -1) - (a.open_days ?? -1))[0];

  return (
    <aside className="drawer" role="dialog" aria-label="Property detail">
      <button type="button" className="close" onClick={onClose} aria-label="Close detail">
        ×
      </button>
      {q.isLoading ? <p>Loading property…</p> : null}
      {q.error ? (
        <p className="notice">
          Could not load property {propertyId}: {q.error.message}
        </p>
      ) : null}
      {p ? (
        <>
          <h2>{p.address ?? `Parcel ${p.parcel_identifier}`}</h2>
          <p className="muted">
            {p.city ?? ""} {p.zip ?? ""} · parcel {p.parcel_identifier}
          </p>
          <dl className="facts-grid">
            <dt>Roof age</dt>
            <dd>
              {p.roof_age_years !== null ? `${p.roof_age_years} years` : "unknown"}{" "}
              <span className="muted">
                (basis: {basisLabel(p.roof_age_basis)}
                {p.roof_date ? `, roof date ${p.roof_date}` : ""})
              </span>
            </dd>
            <dt>Year built</dt>
            <dd>{p.year_built ?? "—"}</dd>
            <dt>Owner location</dt>
            <dd>{(p.owner_location_class ?? "unknown").replaceAll("_", " ")}</dd>
            <dt>Use</dt>
            <dd>{(p.property_usage_type ?? p.property_type ?? "—").replaceAll("_", " ")}</dd>
            <dt>Last sale</dt>
            <dd>{p.last_sale_date ?? "—"}</dd>
          </dl>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={create.isPending}
              onClick={() =>
                create.mutate({ propertyId: p.parcel_identifier, permitId: openLongest?.permit_key })
              }
            >
              Convert to lead
            </button>
            {create.data ? (
              <span role="status" className="notice ok">
                {create.data.created ? "Lead created." : "Already a lead (existing lead returned)."}{" "}
                <a href="#/leads">Open Leads</a>
              </span>
            ) : null}
            {create.error ? <span className="notice">{create.error.message}</span> : null}
          </div>
          <h3>Roofing permits ({roofing.length})</h3>
          {roofing.length ? (
            <ul className="permits">
              {roofing.slice(0, 8).map((x) => (
                <PermitCard key={x.permit_key} p={x} />
              ))}
            </ul>
          ) : (
            <p className="muted">
              {p.permit_jurisdiction_covered
                ? "No roofing permits on record."
                : "No permit data for this jurisdiction in this run."}
            </p>
          )}
          <h3>Provenance</h3>
          <ul className="links provenance">
            <li>
              <Ext href={p.source_url}>Property appraiser record (source)</Ext>
            </li>
            <li>
              <Ext href={d.appraiser_url}>BCPA parcel page</Ext>
            </li>
            {p.property_cid ? (
              <li>
                <Ext href={gatewayUrl(p.property_cid)}>Elephant property {shortCid(p.property_cid)}</Ext>
              </li>
            ) : null}
            <li className="muted">
              Run manifest <code>{snap.data?.manifestCid ?? p.manifest_cid ?? "—"}</code>
            </li>
          </ul>
        </>
      ) : null}
    </aside>
  );
}
