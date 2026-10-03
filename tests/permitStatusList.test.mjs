import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BBB_RATING_UNAVAILABLE,
  NO_CONTRACTOR_RETURNED,
  NO_PERMIT_RETURNED,
  apnBatches,
  isLongOpenPermit,
  jurisdictionLoadsRoofingPermits,
  mapOverlaySentence,
  parcelMarkerKind,
  parcelsForPermitStatus,
  permitAgeYears,
  SAN_JOSE_PERMITS_ONLY,
  selectedParcelPermitView,
  sortParcelsLongOpenFirst,
} from "../src/lib/candidateList.ts";
import {
  installRoofAgeSnapshot,
  meetsMinimumRoofAge,
  parcelsMeetingMinimumRoofAge,
  roofAgeCardLabel,
} from "../src/lib/roofAgeProof.ts";
import { ROOF_AGE_SNAPSHOT_PATH } from "../src/lib/roofAgeSnapshotPath.ts";

const dashboardSource = readFileSync(
  new URL("../src/components/CrmDashboard.tsx", import.meta.url),
  "utf8"
);
const mapSource = readFileSync(
  new URL("../src/components/PropertyMap.tsx", import.meta.url),
  "utf8"
);
const candidateListSource = readFileSync(
  new URL("../src/lib/candidateList.ts", import.meta.url),
  "utf8"
);
const snapshot = JSON.parse(readFileSync(ROOF_AGE_SNAPSHOT_PATH, "utf8"));
installRoofAgeSnapshot(snapshot.parcels);

const NOW = Date.parse("2026-10-01T00:00:00Z");

function permitRow(apn, issueDate, finalDate) {
  return {
    apn,
    permitNumber: `${apn}-${issueDate ?? "none"}`,
    description: "Reroof",
    status: "ISSUED",
    issueDate,
    finalDate,
    contractorName: "SOURCE CONTRACTOR",
    applicantName: null,
    address: null,
    estimatedValue: null,
    layerId: 8,
    layerName: "Active Building Permit",
    sourceUrl: "https://geo.sanjoseca.gov/server/rest/services/PLN/PLN_PermitsAndComplaints/MapServer/8",
  };
}

const FINISHED_ROOFS = [
  "46204039",
  "49454036",
  "56904039",
  "56934012",
  "67620085",
];

test("open permit status keeps open permits without a roof age and all keeps roof-age matches", () => {
  const parcels = [
    ...FINISHED_ROOFS.map((apn) => ({ apn, address: `finished ${apn}` })),
    { apn: "09241022", address: "new roof with open permit" },
    { apn: "68958007", address: "no roof age with open permit" },
  ];
  const permits = [
    permitRow("09241022", "2024-06-01", null),
    permitRow("68958007", "2015-01-01", null),
  ];

  const roofAgeMatches = parcelsMeetingMinimumRoofAge(parcels, 15);
  const openListed = parcelsForPermitStatus(
    roofAgeMatches,
    permits,
    "open",
    parcels
  );
  const allListed = parcelsForPermitStatus(
    roofAgeMatches,
    permits,
    "all",
    parcels
  );

  assert.deepEqual(
    roofAgeMatches.map((parcel) => parcel.apn).sort(),
    [...FINISHED_ROOFS].sort()
  );
  assert.deepEqual(
    openListed.map((parcel) => parcel.apn).sort(),
    ["09241022", "68958007"]
  );
  for (const apn of FINISHED_ROOFS) {
    assert.equal(
      openListed.some((parcel) => parcel.apn === apn),
      false
    );
    assert.equal(
      allListed.some((parcel) => parcel.apn === apn),
      true
    );
  }
  assert.equal(
    allListed.some((parcel) => parcel.apn === "09241022"),
    false
  );
  assert.equal(meetsMinimumRoofAge("67620085", 15), true);
  assert.equal(meetsMinimumRoofAge("09241022", 15), false);
  assert.equal(meetsMinimumRoofAge("68958007", 15), false);
  assert.equal(
    snapshot.parcels["68958007"].roof_age_eligibility_reason,
    "no_valid_anchor"
  );
  assert.equal(
    roofAgeCardLabel("68958007"),
    "There is no publicly available data for the roof age."
  );
  assert.match(
    dashboardSource,
    /parcelsMeetingMinimumRoofAge\(parcels, roofAge\)/
  );
  assert.match(
    dashboardSource,
    /parcelsForPermitStatus\(\s*roofAgeMatches,\s*roofingPermits,\s*permitStatus,\s*parcels,\s*minimumOpenYears\s*\)/
  );
});

test("long-open parcels sort before other parcels", () => {
  const parcels = [
    { apn: "recent-open", address: "recent" },
    { apn: "long-open", address: "long" },
    { apn: "closed-old", address: "closed" },
  ];
  const permits = [
    permitRow("recent-open", "2024-06-01", null),
    permitRow("long-open", "2010-01-01", null),
    permitRow("closed-old", "2010-01-01", "2012-01-01"),
  ];

  assert.deepEqual(
    sortParcelsLongOpenFirst(parcels, permits, NOW).map((parcel) => parcel.apn),
    ["long-open", "recent-open", "closed-old"]
  );
  const nineteen = permitRow("nineteen", "2007-10-01", null);
  const six = permitRow("six", "2020-10-01", null);
  const nineteenAge = permitAgeYears(nineteen.issueDate, NOW);
  const sixAge = permitAgeYears(six.issueDate, NOW);
  assert.equal(nineteenAge !== null && nineteenAge > sixAge, true);
  assert.deepEqual(
    sortParcelsLongOpenFirst(
      [
        { apn: "six", address: "six" },
        { apn: "none", address: "none" },
        { apn: "nineteen", address: "nineteen" },
      ],
      [six, nineteen],
      NOW
    ).map((parcel) => parcel.apn),
    ["nineteen", "six", "none"]
  );
  assert.equal(
    sortParcelsLongOpenFirst(parcels, permits, NOW).some((parcel) =>
      FINISHED_ROOFS.includes(parcel.apn)
    ),
    false
  );
  assert.match(
    dashboardSource,
    /sortParcelsLongOpenFirst\(\s*permitListed,\s*roofingPermits\s*\)/
  );
});

test("duration minimum uses no final date and years since issue", () => {
  const parcels = [
    { apn: "long-open", address: "long" },
    { apn: "recent-open", address: "recent" },
    { apn: "closed-old", address: "closed" },
    { apn: "aged-no-permit", address: "aged" },
  ];
  const permits = [
    permitRow("long-open", "2010-01-01", null),
    permitRow("recent-open", "2024-06-01", null),
    permitRow("closed-old", "2010-01-01", "2012-01-01"),
  ];
  const longAge = permitAgeYears("2010-01-01", NOW);
  const recentAge = permitAgeYears("2024-06-01", NOW);

  assert.equal(longAge !== null && longAge >= 5, true);
  assert.equal(recentAge !== null && recentAge < 5, true);
  assert.equal(isLongOpenPermit(null, longAge), true);
  assert.equal(isLongOpenPermit("2012-01-01", longAge), false);

  assert.deepEqual(
    parcelsForPermitStatus(parcels, permits, "all", parcels, null, NOW).map(
      (parcel) => parcel.apn
    ),
    ["long-open", "recent-open", "closed-old", "aged-no-permit"]
  );
  assert.deepEqual(
    parcelsForPermitStatus(parcels, permits, "open", parcels, 5, NOW).map(
      (parcel) => parcel.apn
    ),
    ["long-open"]
  );
  assert.deepEqual(
    parcelsForPermitStatus(parcels, permits, "all", parcels, 5, NOW).map(
      (parcel) => parcel.apn
    ),
    ["long-open"]
  );
});

test("long-open emphasis uses a final date and an issue age of at least five years", () => {
  const oldOpen = permitRow("67620085", "2018-06-01", null);
  const oldAge = permitAgeYears(oldOpen.issueDate, NOW);
  const recentOpen = permitRow("67620085", "2024-06-01", null);
  const recentAge = permitAgeYears(recentOpen.issueDate, NOW);
  const closed = permitRow("67620085", "2018-06-01", "2019-01-01");
  const closedAge = permitAgeYears(closed.issueDate, NOW);

  assert.equal(oldAge !== null && oldAge >= 5, true);
  assert.equal(recentAge !== null && recentAge < 5, true);
  assert.equal(isLongOpenPermit(oldOpen.finalDate, oldAge), true);
  assert.equal(isLongOpenPermit(recentOpen.finalDate, recentAge), false);
  assert.equal(isLongOpenPermit(closed.finalDate, closedAge), false);
  assert.equal(isLongOpenPermit(null, 5), true);
  assert.equal(isLongOpenPermit(null, 4.9), false);
  assert.equal(isLongOpenPermit(null, null), false);
  assert.equal(permitAgeYears(null, NOW), null);
  assert.match(
    candidateListSource,
    /!finalDate && age !== null && age >= 5/
  );
  assert.match(
    dashboardSource,
    /permitView\.permits\.some\(\(detail\) => detail\.longOpen\)/
  );
  assert.match(dashboardSource, /styles\.longOpen/);
  assert.match(dashboardSource, />\s*Long-open\s*</);
  assert.match(dashboardSource, /styles\.candidateCardLongOpen/);
});

test("selected parcel view shows permit status, duration, contractor, and unavailable BBB", () => {
  const openPermit = permitRow("67620085", "2018-06-01", null);
  const openView = selectedParcelPermitView([openPermit], NOW);
  const openAge = permitAgeYears(openPermit.issueDate, NOW);

  assert.equal(openView.noPermitMessage, null);
  assert.equal(openView.bbbRating, BBB_RATING_UNAVAILABLE);
  assert.equal(openView.bbbRating, "BBB rating unavailable");
  assert.equal(openView.permits.length, 1);
  assert.equal(openView.permits[0].status, "ISSUED");
  assert.equal(openView.permits[0].yearsSinceIssue, openAge);
  assert.equal(openAge !== null && openAge >= 5, true);
  assert.equal(
    openView.permits[0].durationLabel,
    `${openAge.toFixed(1)} years since issue`
  );
  assert.equal(openView.permits[0].longOpen, true);
  assert.equal(openView.permits[0].contractorLabel, "SOURCE CONTRACTOR");

  const missingContractor = {
    ...permitRow("67620085", "2019-01-15", null),
    status: null,
    contractorName: "  ",
  };
  const missingView = selectedParcelPermitView([missingContractor], NOW);
  assert.equal(missingView.permits[0].status, "Active Building Permit");
  assert.equal(missingView.permits[0].contractorLabel, NO_CONTRACTOR_RETURNED);
  assert.equal(missingView.permits[0].contractorLabel, "No contractor was returned");
  assert.equal(missingView.bbbRating, "BBB rating unavailable");

  const closed = permitRow("67620085", "2018-06-01", "2019-01-01");
  const closedView = selectedParcelPermitView([closed], NOW);
  assert.equal(closedView.permits[0].longOpen, false);
  assert.equal(closedView.permits[0].status, "ISSUED");

  const emptyView = selectedParcelPermitView([], NOW);
  assert.deepEqual(emptyView.permits, []);
  assert.equal(emptyView.noPermitMessage, NO_PERMIT_RETURNED);
  assert.equal(
    emptyView.noPermitMessage,
    "No roofing permit was returned for this parcel."
  );
  assert.equal(emptyView.bbbRating, "BBB rating unavailable");

  assert.match(dashboardSource, /selectedParcelPermitView\(\s*permits/);
  assert.match(dashboardSource, /detail\.description/);
  assert.match(dashboardSource, /detail\.issueDate/);
  assert.match(dashboardSource, /detail\.finalDate/);
  assert.match(dashboardSource, /detail\.estimatedValueLabel/);
  assert.match(dashboardSource, /\{detail\.status\}/);
  assert.match(dashboardSource, /\{detail\.durationLabel\}/);
  assert.match(dashboardSource, /\{detail\.contractorLabel\}/);
  assert.match(dashboardSource, /detail\.longOpen/);
  assert.match(dashboardSource, /\{permitView\.noPermitMessage\}/);
  assert.match(dashboardSource, /\{permitView\.bbbRating\}/);
  assert.match(dashboardSource, /roofAgeSourceLabel\(parcel\.apn\)/);
  assert.match(dashboardSource, /Coordinates \$\{parcel\.latitude\.toFixed\(5\)\}/);
  assert.match(
    dashboardSource,
    /Location source: Santa Clara County parcel records\./
  );
  assert.match(dashboardSource, /Permit source/);
  assert.match(dashboardSource, /San Jose building permits/);
  assert.match(dashboardSource, /selectParcel\(parcel\.objectId\)/);
  assert.equal(dashboardSource.includes("OBJECTID"), false);
  assert.equal(dashboardSource.includes("contractor source"), false);
  assert.match(dashboardSource, /\{detail\.permitNumber\}/);
  assert.match(dashboardSource, /\{parcel\.jurisdiction \|\| "Jurisdiction unavailable"\}/);
  assert.match(dashboardSource, /Reset pin/);
  assert.match(mapSource, /L\.DomEvent\.stop\(event\)/);
  assert.match(mapSource, /isParcelDotClick\(event\)/);
  assert.match(mapSource, /toBounds\(radiusMeters \* 2\)/);
  assert.match(mapSource, /flyToBounds\(circleBounds/);
  assert.equal(mapSource.includes("flyTo([latitude, longitude], 13)"), false);
  assert.match(dashboardSource, /Back to radius list/);
  assert.match(dashboardSource, /setSelectedObjectId\(null\)/);
  assert.equal(dashboardSource.includes("bbb.org"), false);

  const described = {
    ...permitRow("67620085", "2018-06-01", "2019-03-01"),
    description: "Reroof | Tear off",
    estimatedValue: 12500,
  };
  const describedView = selectedParcelPermitView([described], NOW);
  assert.equal(describedView.permits[0].description, "Reroof | Tear off");
  assert.equal(describedView.permits[0].estimatedValueLabel, "$12,500");
  assert.equal(describedView.permits[0].issueDate, "2018-06-01");
  assert.equal(describedView.permits[0].finalDate, "2019-03-01");
  assert.equal(describedView.permits[0].status, "ISSUED");
  assert.equal(describedView.bbbRating, "BBB rating unavailable");

  const blankFields = {
    ...permitRow("67620085", "2018-06-01", null),
    description: "  ",
    estimatedValue: null,
    issueDate: null,
    finalDate: null,
  };
  const blankView = selectedParcelPermitView([blankFields], NOW);
  assert.equal("description" in blankView.permits[0], false);
  assert.equal("estimatedValueLabel" in blankView.permits[0], false);
  assert.equal("issueDate" in blankView.permits[0], false);
  assert.equal("finalDate" in blankView.permits[0], false);

  const campbell = selectedParcelPermitView([], NOW, "CAMPBELL");
  assert.equal(campbell.noPermitMessage, SAN_JOSE_PERMITS_ONLY);
  assert.equal(
    campbell.noPermitMessage,
    "Roofing permits are only loaded for San Jose."
  );
  assert.equal(campbell.noPermitMessage.includes("returned"), false);
  assert.equal(jurisdictionLoadsRoofingPermits("San Jose"), true);
  assert.equal(jurisdictionLoadsRoofingPermits(null), false);
  const sanJoseEmpty = selectedParcelPermitView([], NOW, "SAN JOSE");
  assert.equal(sanJoseEmpty.noPermitMessage, NO_PERMIT_RETURNED);
  assert.match(dashboardSource, /SAN_JOSE_PERMITS_ONLY/);
  assert.match(
    dashboardSource,
    /jurisdictionLoadsRoofingPermits\(parcel\.jurisdiction\)/
  );
});

test("permit requests are sent in batches of 100", () => {
  const apns = Array.from({ length: 101 }, (_, index) =>
    String(index).padStart(8, "0")
  );
  const batches = apnBatches(apns);

  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 100);
  assert.equal(batches[1].length, 1);
  assert.deepEqual(apnBatches([]), []);
});

test("permit search contract stays apns and open or all", () => {
  assert.match(dashboardSource, /apnBatches\(apns\)/);
  assert.match(
    dashboardSource,
    /JSON\.stringify\(\{\s*apns:\s*batch,\s*permitStatus:\s*status,\s*\}\)/
  );

  const select = dashboardSource.match(/Permit status[\s\S]*?<\/select>/);
  assert.ok(select);
  const options = [...select[0].matchAll(/<option value="([^"]+)"/g)].map(
    (entry) => entry[1]
  );
  assert.deepEqual(options, ["open", "all"]);

  const parcelParams = dashboardSource.match(
    /new URLSearchParams\(\{([\s\S]*?)\}\)/
  );
  assert.ok(parcelParams);
  const parcelKeys = [
    ...parcelParams[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm),
  ].map((entry) => entry[1]);
  assert.deepEqual(parcelKeys, ["lat", "lng", "radiusMiles"]);
  assert.match(
    dashboardSource,
    /Choose All roofing permits to see them/
  );

  const duration = dashboardSource.match(
    /Listed only if still open at least[\s\S]*?<\/select>/
  );
  assert.ok(duration);
  assert.deepEqual(
    [...duration[0].matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)].map(
      (entry) => [entry[1], entry[2]]
    ),
    [
      ["any", "Any"],
      ["5", "5 years"],
      ["10", "10 years"],
      ["15", "15 years"],
      ["20", "20 years"],
    ]
  );
  assert.match(dashboardSource, /useState<number \| null>\(\s*null\s*\)/);
  assert.equal(dashboardSource.includes("minimumOpenYears:"), false);
});

test("map dots separate matches, long-open houses, and the rest of the page", () => {
  const listed = [{ apn: "young-open" }, { apn: "long-open" }];
  const permits = [
    permitRow("young-open", "2024-06-01", null),
    permitRow("long-open", "2010-01-01", null),
  ];

  assert.equal(
    parcelMarkerKind({ apn: "young-open" }, listed, permits, NOW),
    "match"
  );
  assert.equal(
    parcelMarkerKind({ apn: "long-open" }, listed, permits, NOW),
    "longOpen"
  );
  assert.equal(
    parcelMarkerKind({ apn: "outside" }, listed, permits, NOW),
    "rest"
  );
  assert.match(mapSource, /parcel\.roofAgeSentence/);
  assert.match(mapSource, /\$\{parcel\.objectId\}-\$\{parcel\.markerKind\}/);
  assert.match(mapSource, /parcel-dot-\$\{parcel\.markerKind\}/);
  assert.match(mapSource, /#2563eb/);
  assert.match(mapSource, /#f59e0b/);
  assert.match(mapSource, /#e2e8f0/);
  assert.match(mapSource, /parcel-dot /);

  const counts = mapOverlaySentence({
    drawnCount: 12,
    matchCount: 3,
    truncated: false,
    pageLimit: 500,
    permitsLoading: false,
  });
  assert.equal(
    counts,
    "Showing 12 houses in this radius. 3 match the current filters."
  );
  assert.equal(
    mapOverlaySentence({
      drawnCount: 1,
      matchCount: 1,
      truncated: false,
      pageLimit: 500,
      permitsLoading: false,
    }),
    "Showing 1 house in this radius. 1 matches the current filters."
  );

  const capped = mapOverlaySentence({
    drawnCount: 512,
    matchCount: 4,
    truncated: true,
    pageLimit: 500,
    permitsLoading: false,
  });
  assert.match(capped, /Showing 512 houses in this radius/);
  assert.match(capped, /4 match the current filters/);
  assert.match(
    capped,
    /The map shows the first 500 parcels plus any extra parcels in the circle whose snapshot roof age is at least 15 years/
  );
  assert.equal(capped.includes("maximum"), false);

  const loading = mapOverlaySentence({
    drawnCount: 20,
    matchCount: 0,
    truncated: false,
    pageLimit: 500,
    permitsLoading: true,
  });
  assert.match(loading, /San Jose permits are still loading/);
  assert.equal(loading.includes("match the current filters"), false);
  assert.match(dashboardSource, /mapOverlaySentence\(/);
  assert.match(dashboardSource, /setPermitsLoading\(true\)/);
  assert.match(dashboardSource, /Loading permits/);
  assert.equal(
    dashboardSource.includes("This map displays a maximum of"),
    false
  );
});

test("a narrow window gives the stacked list enough height", () => {
  const css = readFileSync(
    new URL("../src/app/page.module.css", import.meta.url),
    "utf8"
  );
  assert.match(
    css,
    /@media \(max-width: 640px\)[\s\S]*\.candidateList\s*\{[^}]*max-height:\s*max\(70vh,\s*520px\)/
  );
  assert.match(css, /\.mapFrame\s*\{[^}]*height:\s*390px/);
});
