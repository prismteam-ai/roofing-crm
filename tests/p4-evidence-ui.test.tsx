import { it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PermitSchema } from "../packages/contracts/src/index";
import { queryFromUrl, queryToUrl } from "../packages/map-domain/src/index";
import {
  permitOpenDays,
  isExplicitOpenRoofPermit,
} from "../packages/map-domain/src/signals";
import { PermitEvidence } from "../apps/crm-web/src/PermitEvidence";
const permit = PermitSchema.parse({
  id: "synthetic-issued",
  permitNumber: "SYN-ISS-1",
  jurisdiction: "Synthetic jurisdiction",
  status: "open",
  kind: "roof_unspecified",
  statusBasis: "issued_only",
  issuedAt: "2010-01-01",
  openedAt: "2010-01-01",
  closedAt: null,
  reportedStatus: "ISSUED",
  proposedWorkScope: "Synthetic reroof scope",
  contractor: {
    reportedName: "Synthetic business",
    verifiedCompanyId: null,
    license: null,
    rating: null,
  },
  provenance: [],
});
it("persists reported-sale age distinctly and never aliases legacy tenure URL state", () => {
  const base = {
    snapshotId: "synthetic",
    lat: 42.66,
    lng: -83.29,
    radiusMeters: 8046.72,
    minReportedSaleAgeYears: 10,
  };
  const url = queryToUrl(base);
  expect(url).toContain("reportedSaleYears=10");
  expect(url).not.toContain("tenure=");
  expect(queryFromUrl(url)).toMatchObject(base);
  expect(queryFromUrl("?tenure=12").minOwnershipYears).toBe(12);
  expect(queryFromUrl("?tenure=12").minReportedSaleAgeYears).toBeUndefined();
});
it("does not treat issued-only or contradictory status as open duration or completed roof evidence", () => {
  expect(isExplicitOpenRoofPermit(permit)).toBe(false);
  expect(permitOpenDays(permit, "2026-10-27")).toBeNull();
  const html = renderToStaticMarkup(
    <PermitEvidence permit={permit} asOf="2026-10-27" />,
  );
  expect(html).toContain("issued · open status unknown");
  expect(html).toContain("opening not established from issuance");
  expect(html).toContain("Open duration: unknown");
  expect(html).not.toMatch(/Open duration: \d+ days/);
  expect(html).toContain("does not establish roof installation or replacement");
  expect(html).toContain("BBB rating: unavailable / not verified");
});
it("freezes explicit-open duration at its status observation and preserves inactive license labels", () => {
  const open = PermitSchema.parse({
    ...permit,
    statusBasis: "explicit_open",
    reportedStatus: "Open",
    statusObservedAt: "2020-01-11T14:00:00Z",
    openedAt: "2020-01-01",
    contractor: {
      ...permit.contractor,
      licenseEvidence: {
        identifier: "SYN-INACTIVE",
        type: "Synthetic company license",
        status: "Inactive",
        sourceUrl: "https://example.invalid/license",
        observedAt: "2026-10-27T00:00:00Z",
        matchBasis: "Synthetic exact business-name match",
        confidence: "medium",
      },
    },
  });
  expect(permitOpenDays(open, "2026-10-27")).toBe(10);
  expect(
    permitOpenDays({ ...open, statusObservedAt: undefined }, "2026-10-27"),
  ).toBeNull();
  expect(
    permitOpenDays({ ...open, closedAt: "2020-01-11" }, "2026-10-27"),
  ).toBeNull();
  const html = renderToStaticMarkup(
    <PermitEvidence permit={open} asOf="2026-10-27" />,
  );
  expect(html).toContain("10 days as of 2020-01-11");
  expect(html).toContain("status Inactive");
  expect(html).toContain("official identity unresolved");
  expect(html).not.toContain("status Active");
});
it("shows observed license/BBB provenance, match confidence and safe source links without converting a numeric score", () => {
  const withEvidence = PermitSchema.parse({
    ...permit,
    contractor: {
      ...permit.contractor,
      licenseEvidence: {
        identifier: "SYN-LIC",
        type: "Synthetic license type",
        status: "Observed synthetic status",
        sourceUrl: "https://example.invalid/license",
        observedAt: "2026-10-27T00:00:00Z",
        matchBasis: "Synthetic exact business/address comparison",
        confidence: "medium",
      },
      ratingEvidence: {
        value: "A+",
        scale: "BBB",
        sourceUrl: "https://example.invalid/bbb",
        observedAt: "2026-10-27T00:00:00Z",
        matchConfidence: "low",
      },
    },
  });
  const html = renderToStaticMarkup(
    <PermitEvidence permit={withEvidence} asOf="2026-10-27" />,
  );
  expect(html).toContain("SYN-LIC");
  expect(html).toContain("match medium confidence");
  expect(html).toContain("BBB observed rating: A+");
  expect(html).toContain("match low confidence");
  expect(html).toContain('href="https://example.invalid/license"');
  expect(html).toContain("Synthetic exact business/address comparison");
  const numeric = renderToStaticMarkup(
    <PermitEvidence
      permit={{ ...permit, contractor: { ...permit.contractor, rating: 80 } }}
      asOf="2026-10-27"
      synthetic
    />,
  );
  expect(numeric).toContain("Synthetic score: 80/100");
  expect(numeric).not.toContain("BBB observed rating");
  const unsafe = renderToStaticMarkup(
    <PermitEvidence
      permit={{
        ...withEvidence,
        contractor: {
          ...withEvidence.contractor,
          licenseEvidence: {
            ...withEvidence.contractor.licenseEvidence!,
            sourceUrl: "javascript:alert(1)",
          },
        },
      }}
      asOf="2026-10-27"
    />,
  );
  expect(unsafe).not.toContain("javascript:");
});
