import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OwnerObservations } from "../apps/crm-web/src/OwnerObservations";

const observation = {
  reportedName: "SYNTHETIC_OWNER_NAME_FOR_PRIVATE_UI_ONLY",
  sourceLabel: "Owner" as const,
  relatedPermitEvent: { kind: "issued" as const, date: "2026-04-07" },
  ownershipEffectiveDate: null,
  roleVerification: "source_reported_unverified" as const,
  provenance: [
    {
      sourceId: "synthetic-owner-report",
      recordId: "synthetic-owner-row",
      observedAt: "2026-10-28T00:00:00Z",
      digest: "a".repeat(64),
      kind: "synthetic" as const,
    },
  ],
  limitations: ["Synthetic source labels do not verify legal ownership."],
};

it("shows no reported-owner section when the optional observation is absent or empty", () => {
  expect(renderToStaticMarkup(<OwnerObservations />)).toBe("");
  expect(renderToStaticMarkup(<OwnerObservations observations={[]} />)).toBe(
    "",
  );
});

it("labels source-reported owners and related report events without turning them into ownership dates", () => {
  const html = renderToStaticMarkup(
    <OwnerObservations observations={[observation]} />,
  );
  expect(html).toContain("Source-reported Owner:");
  expect(html).toContain(observation.reportedName);
  expect(html).toContain("Related permit report event: issued");
  expect(html).toContain("2026-04-07");
  expect(html).toContain("not an ownership effective date");
  expect(html).toContain("No current or legal ownership");
  expect(html).toContain("ownership at the permit event");
  expect(html).toContain("Ownership effective date: unknown");
  expect(html).toContain("synthetic-owner-report");
  expect(html).toContain("synthetic-owner-row");
  expect(html).toContain("Observed 2026-10-28");
  expect(html).toContain("digest aaaaaaaaaaaa");
  expect(html).toContain('class="permit-detail private-source-reported-owner"');
});

it("keeps applied and issued report dates distinct and never renders unknown-role contacts", () => {
  const withUnrelatedData = {
    ...observation,
    relatedPermitEvent: { kind: "applied" as const, date: "2026-04-01" },
    unknownRoleContact: "DO_NOT_RENDER_UNKNOWN_ROLE_CONTACT",
    email: "DO_NOT_RENDER_CONTACT_EMAIL",
  };
  const html = renderToStaticMarkup(
    <OwnerObservations observations={[withUnrelatedData]} />,
  );
  expect(html).toContain("Related permit report event: applied");
  expect(html).toContain("2026-04-01");
  expect(html).not.toContain("DO_NOT_RENDER");
});

it("does not promote an incorrectly labeled or verified-role observation to an Owner display", () => {
  const notAnOwner = {
    ...observation,
    sourceLabel: "Contact",
  } as unknown as typeof observation;
  const wrongVerification = {
    ...observation,
    roleVerification: "unknown",
  } as unknown as typeof observation;
  expect(
    renderToStaticMarkup(
      <OwnerObservations observations={[notAnOwner, wrongVerification]} />,
    ),
  ).toBe("");
});

it("escapes a source-reported name as text rather than executable markup", () => {
  const html = renderToStaticMarkup(
    <OwnerObservations
      observations={[
        { ...observation, reportedName: "<script>synthetic()</script>" },
      ]}
    />,
  );
  expect(html).toContain("&lt;script&gt;synthetic()&lt;/script&gt;");
  expect(html).not.toContain("<script>");
});
