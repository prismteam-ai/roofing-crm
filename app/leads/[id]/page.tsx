import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadActions } from "@/components/leads/LeadActions";
import { StatusSelect } from "@/components/leads/StatusSelect";
import { Pill, SignalBadge, StatusBadge } from "@/components/ui/Badge";
import { getLead } from "@/lib/db/leads";
import { formatDate, formatDateTime, formatDuration, formatUsd, titleCase } from "@/lib/format";
import type { LeadSignal } from "@/lib/queries/types";
import type { LeadPermit } from "@/lib/db/schema";

/** Lifecycle label for a snapshotted (closed) permit. */
function leadPermitOutcome(p: LeadPermit): string {
  const status = (p.status ?? "closed").toLowerCase();
  if (status === "voided" || status === "expired" || status === "withdrawn") {
    const t = p.issueDate ? new Date(p.issueDate).getTime() : Number.NaN;
    const years = Number.isNaN(t) ? null : (Date.now() - t) / (365.25 * 86400000);
    return `${status} · issued ${years === null ? "n/a" : `${years.toFixed(1)} y`} ago`;
  }
  return `${status} · closed after ${formatDuration(p.daysOpen)}`;
}

export const dynamic = "force-dynamic";

/** Lead detail: property snapshot, permit snapshot, timeline and actions. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();
  const lead = await getLead(numericId);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <Link href="/leads" className="text-xs text-[var(--muted)] underline">
        &larr; All leads
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Lead #{lead.id} · {titleCase(lead.address.split(",")[0])}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {lead.address} · parcel {lead.parcelId}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <SignalBadge signal={lead.signal as LeadSignal} />
            <StatusBadge status={lead.status} />
            <Pill>{lead.priority} priority</Pill>
            {lead.ownerOutOfState && <Pill>owner out of state</Pill>}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">Status</span>
          <StatusSelect leadId={lead.id} status={lead.status} />
          <Link
            href={`/?parcel=${encodeURIComponent(lead.parcelId)}`}
            className="rounded-md border border-[var(--line)] px-2 py-1"
          >
            View on map
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Roof and property
          </h2>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Roof age</dt>
              <dd>
                {lead.roofAgeYears === null
                  ? "unknown"
                  : `${lead.roofAgeYears} y (${lead.roofAgeBasis?.replace("_", " ")})`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Built</dt>
              <dd>{lead.builtYear ?? "n/a"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Open roofing permits</dt>
              <dd>
                {lead.openRoofPermitCount > 0
                  ? `${lead.openRoofPermitCount} · oldest ${formatDuration(lead.oldestOpenRoofPermitDays)}`
                  : "none"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Type</dt>
              <dd>{lead.propertyType ?? "n/a"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Market value</dt>
              <dd>{formatUsd(lead.marketValue)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Owner</dt>
              <dd className="text-right">
                {titleCase(lead.ownerName)}
                {lead.ownerMailState ? ` (${lead.ownerMailState})` : ""}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Last sale</dt>
              <dd>{formatDate(lead.lastSaleDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Coordinates</dt>
              <dd>
                {lead.lat.toFixed(5)}, {lead.lng.toFixed(5)}
              </dd>
            </div>
          </dl>
          {lead.sourceUrls.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Sources
              </div>
              <ul className="mt-1 space-y-0.5 text-xs">
                {lead.sourceUrls.map((u, i) => (
                  <li key={`${i}-${u}`} className="truncate">
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--brand)] underline"
                    >
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 text-sm md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Roofing permit snapshot ({lead.permits.length}) - as of lead creation
          </h2>
          {lead.permits.length === 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              No roofing permits were on record when this lead was created.
            </p>
          )}
          <div className="mt-2 overflow-x-auto">
            {lead.permits.length > 0 && (
              <table className="w-full min-w-[40rem] text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="py-1 pr-3">Permit</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Open / duration</th>
                    <th className="py-1 pr-3">Issued</th>
                    <th className="py-1 pr-3">Contractor</th>
                    <th className="py-1 pr-3">BBB</th>
                    <th className="py-1">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {lead.permits.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--line)] align-top">
                      <td className="py-1.5 pr-3 font-medium">
                        {p.permitNumber}
                        <div className="font-normal text-[var(--muted)]">{p.improvementType}</div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Pill tone={p.isOpen ? "warn" : "neutral"}>{p.status ?? "unknown"}</Pill>
                      </td>
                      <td className="py-1.5 pr-3">
                        {p.isOpen ? `open ${formatDuration(p.daysOpen)}` : leadPermitOutcome(p)}
                      </td>
                      <td className="py-1.5 pr-3">{formatDate(p.issueDate)}</td>
                      <td className="py-1.5 pr-3">
                        {p.contractorName ? (
                          titleCase(p.contractorName)
                        ) : (
                          <span className="text-[var(--muted)]">not recorded</span>
                        )}
                        {p.contractorQualifier && (
                          <div className="text-[var(--muted)]">
                            {titleCase(p.contractorQualifier)}
                          </div>
                        )}
                        {(p.contractorPhone || p.contractorLicense) && (
                          <div className="text-[var(--muted)]">
                            {[p.contractorPhone, p.contractorLicense].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        {p.bbbRating ? (
                          <span>
                            {p.bbbRating}
                            {p.bbbAccredited ? " · accredited" : ""}
                            {p.bbbMatchMethod ? ` · matched by ${p.bbbMatchMethod}` : ""}
                            {p.bbbProfileUrl && (
                              <>
                                {" "}
                                ·{" "}
                                <a
                                  className="underline"
                                  href={p.bbbProfileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  profile
                                </a>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">not available</span>
                        )}
                      </td>
                      <td className="py-1.5">
                        {p.sourceUrl ? (
                          <a
                            href={p.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--brand)] underline"
                          >
                            record
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Actions
          </h2>
          <div className="mt-2">
            <LeadActions leadId={lead.id} />
          </div>
        </section>
        <section className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Activity
          </h2>
          <ol className="mt-2 space-y-2">
            {lead.activities.map((a) => (
              <li key={a.id} className="rounded-md border border-[var(--line)] p-2 text-sm">
                <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                  <span className="uppercase tracking-wide">{a.type.replace("_", " ")}</span>
                  <time dateTime={a.createdAt.toISOString()}>{formatDateTime(a.createdAt)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
