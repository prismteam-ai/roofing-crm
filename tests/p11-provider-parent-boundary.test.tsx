import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PermitSchema } from "../packages/contracts/src/index";
import { isRestrictedProviderPermit } from "../packages/map-domain/src/signals";
import { PermitEvidence } from "../apps/crm-web/src/PermitEvidence";
import { providerObservation } from "./support/source-observations";

it("keeps duplicated provider-only fields in the provider boundary and official parent facts outside it", () => {
  const provider = providerObservation();
  const provenance = {
    sourceId: provider.provenance.sourceId,
    recordId: provider.providerRecordId,
    digest: provider.provenance.recordDigest,
    observedAt: provider.sourceObservedAt,
    kind: "real-minimized" as const,
  };
  const parent = PermitSchema.parse({
    id: "no-provider-name-heuristic",
    status: "unknown",
    kind: "roof_unspecified",
    permitNumber: provider.permitNumber,
    jurisdiction: "Troy",
    issuedAt: provider.dateIssued,
    statusBasis: "issued_only",
    openedAt: null,
    closedAt: null,
    contractor: {
      reportedName: provider.reportedBusinessName,
      verifiedCompanyId: null,
      license: null,
      rating: null,
    },
    provenance: [provenance],
    sourceObservations: [provider],
  });
  expect(isRestrictedProviderPermit(parent)).toBe(true);
  const html = renderToStaticMarkup(
    <PermitEvidence permit={parent} asOf="2026-10-28" />,
  );
  expect(html).toMatch(
    /^<div class="permit-detail"[^>]*data-private-evidence="provider-derived-permit"/,
  );
  expect(html).toContain(provider.reportedBusinessName!);
  const official = PermitSchema.parse({
    ...parent,
    contractor: {
      ...parent.contractor,
      reportedName: "SYNTHETIC_OFFICIAL_PARTY",
    },
    provenance: [
      {
        ...provenance,
        sourceId: "official-synthetic-municipal-source",
        recordId: "SYNTHETIC_OFFICIAL_RECORD",
      },
    ],
  });
  expect(isRestrictedProviderPermit(official)).toBe(false);
  const visible = renderToStaticMarkup(
    <PermitEvidence permit={official} asOf="2026-10-28" />,
  );
  expect(visible).not.toMatch(
    /^<div class="permit-detail"[^>]*data-private-evidence="provider-derived-permit"/,
  );
  expect(visible).toContain("SYNTHETIC_OFFICIAL_PARTY");
  expect(visible).toContain(
    'data-private-evidence="provider-permit-observations"',
  );
});
