"use client";

import { Pill, SignalBadge } from "@/components/ui/Badge";
import { formatDate, formatDuration, formatInt, formatUsd, titleCase } from "@/lib/format";
import type { PermitRecord } from "@/lib/queries/types";
import type { PropertyDetailResponse } from "./types";

export interface PropertyDrawerProps {
  parcelId: string | null;
  detail: PropertyDetailResponse | null;
  loading: boolean;
  error: string | null;
  leadId: number | undefined;
  onClose: () => void;
  onCreateLead: (parcelId: string) => void;
  creating: boolean;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-[var(--line)] py-1 text-xs">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** Years since an ISO date, as of now (null when unknown). */
function yearsSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : (Date.now() - t) / (365.25 * 86400000);
}

/**
 * Human label for a permit's lifecycle: open duration while open; for voided/expired permits
 * how long ago they were issued; for finaled/closed permits how long they took.
 */
export function permitOutcome(p: PermitRecord): string {
  if (p.isOpen) return formatDuration(p.daysOpen);
  const status = (p.status ?? "closed").toLowerCase();
  if (status === "voided" || status === "expired" || status === "withdrawn") {
    const y = yearsSince(p.issueDate);
    return `${status} · issued ${y === null ? "n/a" : `${y.toFixed(1)} y`} ago`;
  }
  const closed = formatDate(p.closeDate ?? p.finalInspectionDate);
  return `${status} · closed after ${formatDuration(p.daysOpen)}${closed !== "n/a" ? ` (${closed})` : ""}`;
}

/** Contractor + BBB block for one permit; shows "not available" explicitly. */
function PermitCard({ p }: { p: PermitRecord }) {
  return (
    <li className="rounded-md border border-[var(--line)] p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="font-medium">
          {p.permitNumber}{" "}
          <span className="font-normal text-[var(--muted)]">
            {p.improvementType ?? p.action ?? ""}
          </span>
        </div>
        <div className="flex gap-1">
          {p.isRoofing && <Pill tone="warn">roofing</Pill>}
          <Pill tone={p.isOpen ? "warn" : "neutral"}>{p.status ?? "unknown"}</Pill>
        </div>
      </div>
      <dl className="mt-1">
        <Row label="Issued" value={formatDate(p.issueDate)} />
        <Row label={p.isOpen ? "Open for" : "Outcome"} value={permitOutcome(p)} />
        {p.expirationDate && <Row label="Expires" value={formatDate(p.expirationDate)} />}
        <Row label="Agency" value={p.issuingAgency ?? p.sourceSystem ?? "n/a"} />
        <Row
          label="Contractor"
          value={
            p.contractorName ? (
              titleCase(p.contractorName)
            ) : (
              <span className="text-[var(--muted)]">not recorded</span>
            )
          }
        />
        {p.contractorQualifier && (
          <Row label="Qualifier" value={titleCase(p.contractorQualifier)} />
        )}
        <Row
          label="Phone"
          value={p.contractorPhone ?? <span className="text-[var(--muted)]">not available</span>}
        />
        <Row
          label="License"
          value={p.contractorLicense ?? <span className="text-[var(--muted)]">not available</span>}
        />
        <Row
          label="BBB rating"
          value={
            p.bbbRating ? (
              <span>
                <strong>{p.bbbRating}</strong> {p.bbbAccredited ? "· accredited" : ""}{" "}
                {p.bbbProfileUrl && (
                  <a
                    href={p.bbbProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--brand)] underline"
                  >
                    profile
                  </a>
                )}
                {p.bbbMatchMethod && (
                  <span className="text-[var(--muted)]"> (matched by {p.bbbMatchMethod})</span>
                )}
              </span>
            ) : (
              <span className="text-[var(--muted)]">not available</span>
            )
          }
        />
        {p.estimatedJobValue !== null && p.estimatedJobValue > 0 && (
          <Row label="Job value" value={formatUsd(p.estimatedJobValue)} />
        )}
        {p.description && <div className="pt-1 text-[var(--muted)]">{p.description}</div>}
        {p.sourceUrl && (
          <div className="pt-1">
            <a
              href={p.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--brand)] underline"
            >
              source record
            </a>
          </div>
        )}
      </dl>
    </li>
  );
}

/** Slide-over with full property details and the permit list. */
export function PropertyDrawer({
  parcelId,
  detail,
  loading,
  error,
  leadId,
  onClose,
  onCreateLead,
  creating,
}: PropertyDrawerProps) {
  if (!parcelId) return null;
  const p = detail?.property;
  const roofing = detail?.permits.filter((x) => x.isRoofing) ?? [];
  const others = detail?.permits.filter((x) => !x.isRoofing) ?? [];
  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-[var(--line)] bg-[var(--panel)] shadow-xl"
      role="dialog"
      aria-label="Property details"
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--line)] p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {p ? titleCase(p.street) : "Property"}
          </div>
          <div className="truncate text-xs text-[var(--muted)]">
            {p ? `${titleCase(p.city)} ${p.zip ?? ""} · parcel ${p.parcelId}` : parcelId}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-[var(--muted)] hover:bg-gray-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && <p className="text-sm text-[var(--muted)]">Loading property...</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {p && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-1">
              <SignalBadge signal={p.signal} />
              {p.ownerOutOfState && <Pill>owner out of state</Pill>}
              {(p.yearsSinceSale ?? 0) >= 10 && (
                <Pill>no sale {Math.floor(p.yearsSinceSale ?? 0)}+ y</Pill>
              )}
            </div>
            <div className="mb-3 flex gap-2">
              {leadId ? (
                <a
                  href={`/leads/${leadId}`}
                  className="rounded-md border border-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand)]"
                >
                  Open lead #{leadId}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => onCreateLead(p.parcelId)}
                  disabled={creating}
                  className="rounded-md bg-[var(--brand)] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create lead"}
                </button>
              )}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Roof
            </h3>
            <dl className="mb-3">
              <Row
                label="Roof age"
                value={p.roofAgeYears === null ? "unknown" : `${p.roofAgeYears} years`}
              />
              <Row
                label="Basis"
                value={
                  p.roofAgeBasis === "roof_permit"
                    ? `last roofing permit ${formatDate(p.lastRoofPermitDate)}`
                    : p.roofAgeBasis === "built_year"
                      ? `year built ${p.builtYear ?? "n/a"} (proxy)`
                      : "no roofing permit or year built"
                }
              />
              <Row
                label="Open roofing permits"
                value={
                  p.openRoofPermitCount > 0
                    ? `${p.openRoofPermitCount} (oldest ${formatDuration(p.oldestOpenRoofPermitDays)})`
                    : "none"
                }
              />
              <Row label="All permits" value={formatInt(p.permitCount)} />
            </dl>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Property
            </h3>
            <dl className="mb-3">
              <Row label="Type" value={`${p.propertyType ?? "n/a"} · ${p.usageType ?? ""}`} />
              <Row
                label="Built / effective"
                value={`${p.builtYear ?? "n/a"} / ${p.effectiveYear ?? "n/a"}`}
              />
              <Row
                label="Heated area"
                value={p.livableFloorArea ? `${formatInt(p.livableFloorArea)} sq ft` : "n/a"}
              />
              <Row label="Lot" value={p.lotSizeAcre ? `${p.lotSizeAcre.toFixed(2)} ac` : "n/a"} />
              <Row label="Market value" value={formatUsd(p.marketValue)} />
              <Row label="Assessed" value={formatUsd(p.assessedValue)} />
              {p.subdivision && <Row label="Subdivision" value={titleCase(p.subdivision)} />}
            </dl>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Owner
            </h3>
            <dl className="mb-3">
              <Row label="Owner" value={titleCase(p.ownersText ?? p.ownerName)} />
              <Row
                label="Mails from"
                value={
                  [p.ownerMailCity ? titleCase(p.ownerMailCity) : null, p.ownerMailState]
                    .filter(Boolean)
                    .join(", ") || "n/a"
                }
              />
              <Row
                label="Owner occupied"
                value={p.ownerOccupied === null ? "n/a" : p.ownerOccupied ? "yes" : "no"}
              />
              <Row
                label="Last sale"
                value={`${formatDate(p.lastSaleDate)} ${p.lastSalePrice ? `· ${formatUsd(p.lastSalePrice)}` : ""}`}
              />
            </dl>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Roofing permits ({roofing.length})
            </h3>
            {roofing.length === 0 && (
              <p className="mb-2 text-xs text-[var(--muted)]">
                No roofing permits on record for this parcel.
              </p>
            )}
            <ul className="mb-3 space-y-2">
              {roofing.map((pr) => (
                <PermitCard key={`${pr.permitNumber}-${pr.issueDate}`} p={pr} />
              ))}
            </ul>
            {others.length > 0 && (
              <details className="mb-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Other permits ({others.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {others.map((pr) => (
                    <PermitCard key={`${pr.permitNumber}-${pr.issueDate}`} p={pr} />
                  ))}
                </ul>
              </details>
            )}
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Sources
            </h3>
            <ul className="mt-1 space-y-0.5 text-xs">
              {p.sourceUrls.length === 0 && (
                <li className="text-[var(--muted)]">No source URLs recorded.</li>
              )}
              {p.sourceUrls.map((u, i) => (
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
          </>
        )}
      </div>
    </aside>
  );
}
