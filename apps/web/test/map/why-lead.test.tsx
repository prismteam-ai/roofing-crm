// "Why is this a lead?" (CRM-HANDOFF §4.3, board Explore1440 whyView): the rules, the panel with
// Verify CID and Details, the row's button, and the drawer's Lineage · Metadata and Ask about it.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";

let appLinks: { data?: { countyLensUrl: string } } = {
  data: { countyLensUrl: "https://lens.example" },
};
vi.mock("../../src/components/AppShell/shellApi.js", () => ({
  useShellAppLinks: () => appLinks,
}));

import { WhyPanel } from "../../src/routes/Map/WhyPanel";
import { ResultRow } from "../../src/routes/Map/ResultRow";
import {
  hasUnfinaledRoofPermit,
  mainPermitOf,
  runLabel,
  whyLead,
} from "../../src/routes/Map/whyLead";

afterEach(() => {
  cleanup();
  appLinks = { data: { countyLensUrl: "https://lens.example" } };
});

const TABLE_CID = "bafybeiproperty7m2c";
const PERMIT_CID = "bafybeipermitq4xa";

const property = {
  propertyCid: "baguqeeraproperty",
  requestIdentifier: "138273",
  latitude: 30.3597374,
  longitude: -97.751527,
  coordinateSource: "gis_centroid",
  propertyType: "Building",
  propertyUsageType: "Residential",
  roofAgeYears: 31,
  roofAgeBasis: "built_year",
  roofAgeConfidence: "low",
  isLongTenure: true,
  tenureBasis: "deed_date",
  ownerName: "DOE, JANE",
  ownerKind: "person",
  ownerAreaClass: "unknown",
  ownerIsOutOfArea: null,
  sourceManifestCid: "bafkreimanifest",
  missingReasons: [],
  capturedAt: "2026-10-22T05:48:41Z",
  cid: TABLE_CID,
  runId: "travis-full-run3-20261025",
} as unknown as Provenanced<CrmProperty>;

const permit = (over: Partial<Provenanced<CrmPermit>> = {}): Provenanced<CrmPermit> =>
  ({
    propertyCid: property.propertyCid,
    permitCid: "bafkreipermit",
    permitNumber: "2024-019307 BP",
    statusClass: "open",
    openDays: 804,
    contractorNameAsPrinted: "EXAMPLE ROOFING LLC",
    bbbStatus: "blocked",
    bbbStatusReason: "bbb_blocked",
    bbbUrl:
      "https://www.bbb.org/search?find_country=USA&find_text=EXAMPLE%20ROOFING%20LLC&find_loc=Austin%2C%20TX&find_type=Category",
    missingReasons: [],
    capturedAt: "2026-10-25T08:20:38Z",
    cid: PERMIT_CID,
    runId: "travis-full-run3-20261025",
    ...over,
  }) as unknown as Provenanced<CrmPermit>;

const centre = { lat: 30.35, lng: -97.74 };

describe("whyLead", () => {
  it("lists only the rules the row meets, each with source, run and CID", () => {
    const why = whyLead({
      property,
      permits: [permit()],
      center: centre,
      radiusMi: 5,
      centreLabel: "the pin",
    });
    expect(why.rules.map((r) => r.key)).toEqual(["distance", "roof", "permit", "owner"]);
    expect(why.rules[0]).toMatchObject({
      rule: "Within 5 mi of the pin",
      source: "Parcel centre (GIS) · Run 3",
      cid: TABLE_CID,
    });
    expect(why.rules[0]?.value).toContain("to the property's coordinates");
    expect(why.rules[1]?.value).toContain("estimated from year built");
    expect(why.rules[2]).toMatchObject({ source: "Austin permits · Run 3", cid: PERMIT_CID });
    expect(why.rules[2]?.value).toContain(
      "“EXAMPLE ROOFING LLC” as printed on the permit, unverified",
    );
    expect(why.coordinates?.text).toBe("30.35974, -97.75153");
    expect(why.coordinates?.osmUrl).toContain("openstreetmap.org");
  });

  it("leaves out a signal the data does not carry, never showing it as met", () => {
    const bare = {
      ...property,
      roofAgeYears: null,
      ownerKind: null,
    } as unknown as Provenanced<CrmProperty>;
    const why = whyLead({ property: bare, permits: [permit({ statusClass: "closed" })] });
    expect(why.rules).toEqual([]);
  });

  it("the main permit is the open or stalled one open longest; run ids read as Run n", () => {
    const main = mainPermitOf([
      permit({ openDays: 10 }),
      permit({ statusClass: "stalled", openDays: 900, cid: "x" }),
    ]);
    expect(main?.openDays).toBe(900);
    expect(runLabel("travis-full-run2-20261024")).toBe("Run 2");
    expect(runLabel("weird")).toBe("weird");
  });
});

describe("hasUnfinaledRoofPermit", () => {
  it("is true only for a live (open or stalled) permit with no final date", () => {
    expect(hasUnfinaledRoofPermit([{ statusClass: "open" }])).toBe(true);
    expect(hasUnfinaledRoofPermit([{ statusClass: "stalled", finalDate: null }])).toBe(true);
    expect(hasUnfinaledRoofPermit([{ statusClass: "stalled", finalDate: "1991-04-15" }])).toBe(
      false,
    );
  });

  it("a closed permit with no final date is not live, and neither is one with no status", () => {
    expect(hasUnfinaledRoofPermit([{ statusClass: "closed" }])).toBe(false);
    expect(hasUnfinaledRoofPermit([{ statusClass: null }])).toBe(false);
    expect(hasUnfinaledRoofPermit([])).toBe(false);
    expect(hasUnfinaledRoofPermit(undefined)).toBe(false);
  });
});

describe("WhyPanel", () => {
  const renderPanel = (over: Partial<Parameters<typeof WhyPanel>[0]> = {}) => {
    const onBack = vi.fn();
    const onDetails = vi.fn();
    render(
      <WhyPanel
        property={property}
        permits={[permit()]}
        center={centre}
        radiusMi={5}
        centreLabel="the pin"
        onBack={onBack}
        onDetails={onDetails}
        {...over}
      />,
    );
    return { onBack, onDetails };
  };

  it("shows the heading, every rule, the coordinates, Verify CID and Details", () => {
    const { onBack, onDetails } = renderPanel();
    expect(screen.getByRole("region", { name: "Why TCAD 138273 is a lead" })).toBeTruthy();
    expect(document.querySelectorAll("[data-why-rule]")).toHaveLength(4);
    expect(document.querySelector("[data-why-coordinates]")?.textContent).toContain(
      "Parcel centre (GIS)",
    );
    const verify = document.querySelector("a[data-why-verify]") as HTMLAnchorElement;
    expect(verify.getAttribute("href")).toBe("https://lens.example/data/verify/bafkreimanifest");
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(onDetails).toHaveBeenCalledWith("baguqeeraproperty");
    fireEvent.click(screen.getByRole("button", { name: /Back to results/ }));
    expect(onBack).toHaveBeenCalled();
  });

  it("says so when the link is not available, and when there is no signal", () => {
    appLinks = {};
    renderPanel({
      property: {
        ...property,
        roofAgeYears: null,
        ownerKind: null,
      } as unknown as Provenanced<CrmProperty>,
      permits: [],
      center: undefined,
      radiusMi: undefined,
    });
    expect(document.querySelector("[data-why-verify='unavailable']")?.textContent).toContain(
      "link not available",
    );
    expect(document.querySelector("[data-why-empty]")).not.toBeNull();
  });
});

describe("ResultRow", () => {
  it("an expanded row shows the contractor as printed and BBB, and a Why button that opens the panel", () => {
    const onWhy = vi.fn();
    render(
      <ResultRow
        row={property}
        permits={[permit()]}
        onWhy={onWhy}
        expanded
        onToggleExpanded={vi.fn()}
      />,
    );
    expect(
      document.querySelector("[data-field='contractor_name_as_printed']")?.textContent,
    ).toContain("“EXAMPLE ROOFING LLC” as printed on permit · not verified");
    expect(document.querySelector("[data-field='bbb_status']")?.textContent).toContain(
      "BBB rating not available",
    );
    fireEvent.click(screen.getByRole("button", { name: "Why is this a lead?" }));
    expect(onWhy).toHaveBeenCalledWith("baguqeeraproperty");
  });
});

describe("BBB link", () => {
  it("is on the expanded row and in the Why panel, without find_type, and only for https", () => {
    const { unmount } = render(
      <ResultRow row={property} permits={[permit()]} expanded onToggleExpanded={vi.fn()} />,
    );
    let href = document.querySelector("a[data-field='bbb_url']")?.getAttribute("href") ?? "";
    expect(href).toContain("find_text=EXAMPLE");
    expect(href).not.toContain("find_type");
    unmount();
    render(
      <WhyPanel property={property} permits={[permit()]} onBack={vi.fn()} onDetails={vi.fn()} />,
    );
    href =
      document
        .querySelector("[data-why-rule='permit'] a[data-field='bbb_url']")
        ?.getAttribute("href") ?? "";
    expect(href).toContain("bbb.org/search");
    expect(href).not.toContain("find_type");
    cleanup();
    render(
      <ResultRow
        row={property}
        permits={[permit({ bbbUrl: "javascript:alert(1)" } as Partial<Provenanced<CrmPermit>>)]}
        expanded
        onToggleExpanded={vi.fn()}
      />,
    );
    expect(document.querySelector("a[data-field='bbb_url']")).toBeNull();
  });
});

describe("WhyPanel scroll", () => {
  it("scrolls the list's scrolling container back to the top and takes focus", () => {
    const sheet = document.createElement("div");
    sheet.style.overflowY = "auto";
    Object.defineProperty(sheet, "scrollHeight", { value: 800, configurable: true });
    Object.defineProperty(sheet, "clientHeight", { value: 400, configurable: true });
    sheet.scrollTop = 86;
    document.body.appendChild(sheet);
    render(
      <WhyPanel property={property} permits={[permit()]} onBack={vi.fn()} onDetails={vi.fn()} />,
      {
        container: sheet.appendChild(document.createElement("div")),
      },
    );
    expect(sheet.scrollTop).toBe(0);
    expect(document.activeElement).toBe(document.querySelector("[data-why-panel]"));
    sheet.remove();
  });
});
