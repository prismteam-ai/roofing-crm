import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  PropertySchema,
  type QueryInput,
} from "../../packages/contracts/src/index";
import { propertyMatchesQuery } from "../../packages/contracts/src/query-predicates";
import { officialPlaceResolver } from "../../packages/places/src/index";
import { nonemptyEvidenceProperty } from "../support/evidence-fixture";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`primary permit modes, source detail and candidate-only map apply at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const queries: QueryInput[] = [],
      errors: string[] = [];
    let agentPosts = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    const property = PropertySchema.parse({
      ...nonemptyEvidenceProperty,
      id: "SYN-P12B-PROPERTY",
      nativeId: "SYN-P12B-PROPERTY",
      address: "Synthetic UI verification property",
      permits: [
        {
          id: "SYN-P12B-PERMIT",
          kind: "roof_replacement",
          issuedAt: "2018-01-12",
          status: "unknown",
          statusBasis: "issued_only",
          reportedStatus: null,
          openedAt: null,
          closedAt: null,
          contractor: {
            reportedName: "Synthetic applicant",
            verifiedCompanyId: null,
            license: null,
            rating: null,
          },
          provenance: [
            {
              sourceId: "synthetic-native-issued",
              recordId: "SYN-P12B-PERMIT",
              kind: "synthetic",
              observedAt: "2026-10-28T00:00:00Z",
              digest: "synthetic",
            },
          ],
        },
      ],
    });
    const hash = (q: QueryInput) =>
      createHash("sha256").update(JSON.stringify(q)).digest("hex");
    const response = (q: QueryInput) => {
      const rows = propertyMatchesQuery(property, q)
        ? [{ ...property, distanceMeters: 0 }]
        : [];
      return {
        contractVersion: CONTRACT_VERSION,
        snapshotId: q.snapshotId,
        queryHash: hash(q),
        rows,
        total: rows.length,
        truncated: false,
        nextCursor: null,
        limitations: ["Synthetic UI test only; not admitted real-source proof"],
      };
    };
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      let body: unknown = {};
      if (u.pathname === "/api/health")
        body = {
          snapshotId: "synthetic-p12b",
          contractVersion: CONTRACT_VERSION,
          mode: "synthetic",
          dataMode: "synthetic",
          digest: "synthetic",
          accessMode: "review-session",
          provider: "deterministic-offline",
        };
      else if (u.pathname === "/api/session")
        body = { session: { id: "synthetic-p12b-session" } };
      else if (u.pathname === "/api/map-config") body = { kind: "offline" };
      else if (u.pathname === "/api/leads") body = [];
      else if (u.pathname.startsWith("/api/properties/")) body = property;
      else if (u.pathname === "/api/search") {
        const q = route.request().postDataJSON() as QueryInput;
        queries.push(q);
        body = response(q);
      } else if (u.pathname === "/api/agent") {
        agentPosts++;
        const base = queries.at(-1)!;
        const strict = {
          ...base,
          permitOpportunityMode: "confirmed_open" as const,
          permitStatus: "any" as const,
          minOpenDays: 0,
          minPermitObservationAgeYears: 5,
          sort: "permit_open_days_desc" as const,
        };
        const candidate = {
          ...strict,
          permitOpportunityMode: "status_verification_needed" as const,
          sort: "permit_issue_age_desc" as const,
        };
        body = {
          mode: "deterministic-offline",
          answer:
            "No confirmed open permits; separately qualified verification candidates are available.",
          query: strict,
          results: [],
          citations: [],
          caveats: [],
          toolTrace: [],
          sourceQualifiedAlternativeSections: true,
          permitSections: [
            {
              kind: "confirmed_open",
              label: "Confirmed open permits",
              query: strict,
              queryHash: hash(strict),
              total: 0,
              returnedCount: 0,
              truncated: false,
              nextCursor: null,
              results: [],
              citations: [],
              caveats: [],
            },
            {
              kind: "status_verification_needed",
              label: "Status verification needed",
              query: candidate,
              queryHash: hash(candidate),
              total: 1,
              returnedCount: 1,
              truncated: false,
              nextCursor: null,
              results: [property],
              citations: ["synthetic-native-issued:SYN-P12B-PERMIT"],
              caveats: ["These are not confirmed open permits."],
            },
          ],
        };
      }
      await route.fulfill({ status: 200, json: body });
    });
    await page.goto(
      "/?permitMode=status_verification_needed&permitAgeYears=-1",
    );
    await expect(page.getByTestId("invalid-query-url")).toBeVisible();
    await page
      .getByLabel("Agent prompt")
      .fill(
        "show me open roofing permits older than five years within five miles",
      );
    await page.getByLabel("Agent prompt").press("Enter");
    await page.waitForTimeout(250); // Finite absence window, beyond the search debounce; no request is expected.
    expect(agentPosts).toBe(0);
    expect(queries).toHaveLength(0);
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Clear invalid URL filters" })
      .click();
    await expect(page.getByTestId("invalid-query-url")).toHaveCount(0);
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    await page
      .getByLabel("Permit opportunities", { exact: true })
      .selectOption("confirmed_open");
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await page
      .getByLabel("Permit opportunities", { exact: true })
      .selectOption("status_verification_needed");
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    await expect(
      page.getByLabel("Minimum open days", { exact: true }),
    ).toBeDisabled();
    await expect(
      page
        .getByTestId("property-row")
        .getByText("Status verification needed", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Minimum age since issue/status years", { exact: true })
      .fill("20");
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await page
      .getByLabel("Minimum age since issue/status years", { exact: true })
      .fill("5");
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    await page.getByTestId("property-row").click();
    await expect(
      page
        .getByRole("dialog", { name: "Property detail" })
        .getByText("Status verification needed", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Source status: not reported"),
    ).toBeVisible();
    await page.getByLabel("Close property detail").click();
    await page
      .getByLabel("Permit opportunities", { exact: true })
      .selectOption("confirmed_open");
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await page
      .getByLabel("Agent prompt")
      .fill(
        "show me open roofing permits older than five years within five miles",
      );
    await page.getByRole("button", { name: "Ask agent" }).click();
    const sections = page.getByTestId("agent-permit-sections");
    await expect(
      sections.getByRole("heading", { name: "Confirmed open permits" }),
    ).toBeVisible();
    await expect(
      sections.getByText(
        "These are not confirmed open permits. Their current lifecycle requires municipal verification.",
      ),
    ).toBeVisible();
    await sections
      .getByRole("button", { name: /Synthetic UI verification property/ })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("Status verification needed", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Source status: not reported"),
    ).toBeVisible();
    await expect(
      page.getByLabel("Permit opportunities", { exact: true }),
    ).toHaveValue("confirmed_open");
    await page.getByLabel("Close property detail").click();
    await sections
      .getByRole("button", { name: "Show verification candidates on map" })
      .click();
    await expect
      .poll(() => queries.at(-1)?.permitOpportunityMode)
      .toBe("status_verification_needed");
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    const troy = officialPlaceResolver.resolve("City of Troy");
    if (troy.status !== "resolved")
      throw new Error("Official Troy place missing");
    await page
      .getByLabel("Search area", { exact: true })
      .selectOption(troy.place.placeId);
    await expect.poll(() => queries.at(-1)?.placeId).toBe(troy.place.placeId);
    await expect(page.getByTestId("property-row")).toHaveCount(0);
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((node) => node.clientWidth),
    );
    expect(errors).toEqual([]);
  });
}
