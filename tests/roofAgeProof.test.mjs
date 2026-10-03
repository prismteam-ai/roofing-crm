import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  lookupSantaClaraParcelAddresses,
  searchSantaClaraParcelsInRadius,
} from "../src/lib/santaClaraParcels.ts";
import {
  installRoofAgeSnapshot,
  meetsMinimumRoofAge,
  parcelsMeetingMinimumRoofAge,
  roofAgeCardLabel,
  roofAgeRowsWithDates,
  undashedApn,
} from "../src/lib/roofAgeProof.ts";
import { ROOF_AGE_SNAPSHOT_PATH } from "../src/lib/roofAgeSnapshotPath.ts";

process.env.ROOF_AGE_SNAPSHOT_FILE = ROOF_AGE_SNAPSHOT_PATH;

const PENDING = "There is no publicly available data for the roof age.";
const dashboardSource = readFileSync(
  new URL("../src/components/CrmDashboard.tsx", import.meta.url),
  "utf8"
);
const snapshot = JSON.parse(readFileSync(ROOF_AGE_SNAPSHOT_PATH, "utf8"));
installRoofAgeSnapshot(snapshot.parcels);

function labelFromSnapshotRow(row) {
  if (
    row.roof_age_eligibility_reason === "no_valid_anchor" ||
    row.roof_age_years === null
  ) {
    return "There is no publicly available data for the roof age.";
  }

  const age = `${row.roof_age_years} ${
    row.roof_age_years === 1 ? "year" : "years"
  } old`;
  const replaced = row.roof_date
    ? `replaced ${row.roof_date}`
    : "replacement date unavailable";
  const permit = row.roof_age_permit_id
    ? `permit ${row.roof_age_permit_id}`
    : "permit number unavailable";

  return `${age}, ${replaced}, ${permit}`;
}

test("three proven APNs render Oracle roof-age fields", () => {
  const recent = roofAgeCardLabel("09241022");
  assert.equal(
    recent,
    "0 years old, replaced 2026-09-12, permit 2026-135571-RS"
  );

  const unanchored = roofAgeCardLabel("68958007");
  assert.equal(
    unanchored,
    "There is no publicly available data for the roof age."
  );
  assert.equal(unanchored.includes("1997-10-22"), false);
  assert.equal(unanchored.includes("1997"), false);

  const older = roofAgeCardLabel("67620085");
  assert.equal(
    older,
    "16 years old, replaced 2010-06-01, permit 2010-012446-RS"
  );

  assert.match(dashboardSource, /\{roofAgeCardLabel\(parcel\.apn\)\}/);
});

test("the page sends only dated roof ages to the browser", () => {
  const dated = roofAgeRowsWithDates(snapshot.parcels);
  assert.equal(dated["68958007"], undefined);
  assert.equal(typeof dated["67620085"].roof_age_years, "number");
  assert.ok(Object.keys(dated).length < Object.keys(snapshot.parcels).length);
});

test("any other APN keeps the pending roof-age message", () => {
  assert.equal(roofAgeCardLabel("00000000"), PENDING);
  assert.equal(roofAgeCardLabel("09241023"), PENDING);
  assert.equal(roofAgeCardLabel(""), PENDING);
});

test("parcel search params are only lat, lng, and radiusMiles", () => {
  const match = dashboardSource.match(/new URLSearchParams\(\{([\s\S]*?)\}\)/);
  assert.ok(match);
  const keys = [...match[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm)].map(
    (entry) => entry[1]
  );
  assert.deepEqual(keys, ["lat", "lng", "radiusMiles"]);
  assert.equal(keys.includes("roofAge"), false);
});

test("oracle roof-age snapshot has the published census", () => {
  const rows = Object.values(snapshot.parcels);

  assert.equal(Object.keys(snapshot.parcels).length, 6955);
  assert.equal(
    rows.filter(
      (row) =>
        row.roof_age_eligibility_reason ===
        "accepted_completed_primary_roof_replacement"
    ).length,
    59
  );
  assert.equal(rows.filter((row) => row.olderThan15Years).length, 5);
  assert.equal(
    rows.every((row) => row.builtYear === null),
    true
  );

  assert.equal(
    roofAgeCardLabel("67620085"),
    labelFromSnapshotRow(snapshot.parcels["67620085"])
  );
  assert.equal(
    roofAgeCardLabel("09241022"),
    labelFromSnapshotRow(snapshot.parcels["09241022"])
  );
  assert.equal(
    roofAgeCardLabel("68958007"),
    labelFromSnapshotRow(snapshot.parcels["68958007"])
  );
  assert.equal(
    snapshot.parcels["68958007"].roof_age_eligibility_reason,
    "no_valid_anchor"
  );
  assert.equal(snapshot.parcels["68958007"].roof_date, null);
  assert.equal(snapshot.parcels["68958007"].roof_age_permit_id, null);
  assert.equal(snapshot.parcels["67620085"].roof_age_years, 16);
  assert.equal(snapshot.parcels["09241022"].roof_age_years, 0);
});

test("minimum roof age 15 lists only snapshot ages of at least 15", () => {
  const radiusParcels = [
    { apn: "67620085", address: "older roof" },
    { apn: "09241022", address: "new roof" },
    { apn: "68958007", address: "no anchor" },
    { apn: "00000000", address: "absent from snapshot" },
  ];

  const listed = parcelsMeetingMinimumRoofAge(radiusParcels, 15);

  assert.deepEqual(
    listed.map((parcel) => parcel.apn),
    ["67620085"]
  );
  assert.equal(meetsMinimumRoofAge("67620085", 15), true);
  assert.equal(meetsMinimumRoofAge("676-20-085", 15), true);
  assert.equal(meetsMinimumRoofAge("09241022", 15), false);
  assert.equal(meetsMinimumRoofAge("68958007", 15), false);
  assert.equal(meetsMinimumRoofAge("00000000", 15), false);
  assert.match(
    dashboardSource,
    /parcelsMeetingMinimumRoofAge\(parcels, roofAge\)/
  );
});

const recordedGeom67620085 = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [-121.795368228717, 37.312160271065],
        [-121.795412283072, 37.312155738526],
        [-121.795456562659, 37.312154933315],
        [-121.795500752679, 37.312157861156],
        [-121.79560488898, 37.312173753835],
        [-121.795666343627, 37.312177977784],
        [-121.795728016564, 37.312177114703],
        [-121.795741742671, 37.312176667009],
        [-121.795755349597, 37.312178526584],
        [-121.795768452256, 37.312182640801],
        [-121.795780679833, 37.312188893224],
        [-121.79579168628, 37.312197106906],
        [-121.795801160106, 37.312207049394],
        [-121.795808833195, 37.312218439308],
        [-121.795814488394, 37.312230954306],
        [-121.795846733421, 37.312369143348],
        [-121.79543101826, 37.312430243951],
        [-121.795368228717, 37.312160271065],
      ],
    ],
  ],
};

function representativePoint(coordinates) {
  const points = [];

  function collect(value) {
    if (!Array.isArray(value)) return;

    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      points.push(value);
      return;
    }

    for (const child of value) collect(child);
  }

  collect(coordinates);

  let minLongitude = Infinity;
  let maxLongitude = -Infinity;
  let minLatitude = Infinity;
  let maxLatitude = -Infinity;

  for (const [longitude, latitude] of points) {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
  };
}

test("qualifying parcel past the first within_circle page is merged", async () => {
  const latitude = 37.33;
  const longitude = -121.88;
  const radiusMeters = 1609.344;
  const circle = `within_circle(the_geom,${latitude},${longitude},${radiusMeters})`;
  const qualifyingApns = Object.keys(snapshot.parcels).filter((apn) =>
    meetsMinimumRoofAge(apn, 15)
  );
  const firstPage = [
    { objectid: "1", apn: "09241022" },
    { objectid: "2", apn: "68958007" },
  ];

  for (let index = 0; index < 98; index += 1) {
    firstPage.push({
      objectid: String(1000 + index),
      apn: String(80000000 + index),
    });
  }

  assert.equal(firstPage.length, 100);
  assert.equal(
    firstPage.some((row) => row.apn === "67620085"),
    false
  );

  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push(url);
    const where = url.searchParams.get("$where") ?? "";

    if (where === circle) {
      assert.equal(url.searchParams.get("$limit"), "101");
      return Response.json(firstPage);
    }

    const apnClause = where.slice(where.indexOf("apn in("));
    assert.equal(where.startsWith(`${circle} AND apn in(`), true);
    assert.equal(apnClause.includes("-"), false);
    for (const apn of qualifyingApns) {
      assert.equal(apnClause.includes(`'${undashedApn(apn)}'`), true);
    }
    assert.equal(url.searchParams.get("$limit"), String(qualifyingApns.length));

    return Response.json([
      {
        objectid: "366283",
        apn: "67620085",
        jurisdiction: "SAN JOSE",
        situs_house_number: "3350",
        situs_street_name: "KETTMANN",
        situs_street_type: "RD",
        situs_city_name: "SAN JOSE",
        the_geom: recordedGeom67620085,
      },
    ]);
  };

  try {
    const { parcels, truncated } = await searchSantaClaraParcelsInRadius({
      latitude,
      longitude,
      radiusMeters,
      limit: 100,
    });
    assert.equal(truncated, false);
    const listed = parcelsMeetingMinimumRoofAge(parcels, 15);
    const older = parcels.find((parcel) => undashedApn(parcel.apn) === "67620085");
    const point = representativePoint(recordedGeom67620085.coordinates);

    assert.equal(calls.length, 2);
    assert.ok(older);
    assert.equal(older.latitude, point.latitude);
    assert.equal(older.longitude, point.longitude);
    assert.deepEqual(
      listed.map((parcel) => undashedApn(parcel.apn)),
      ["67620085"]
    );
    assert.equal(
      parcels.some((parcel) => undashedApn(parcel.apn) === "09241022"),
      true
    );
    assert.equal(meetsMinimumRoofAge("09241022", 15), false);
    assert.equal(
      listed.some((parcel) => undashedApn(parcel.apn) === "09241022"),
      false
    );
    assert.equal(
      parcels.some((parcel) => undashedApn(parcel.apn) === "68958007"),
      true
    );
    assert.equal(meetsMinimumRoofAge("68958007", 15), false);
    assert.equal(
      snapshot.parcels["68958007"].roof_age_eligibility_reason,
      "no_valid_anchor"
    );
    assert.equal(
      roofAgeCardLabel("68958007"),
      "There is no publicly available data for the roof age."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a full county page reports that more parcels exist", async () => {
  const latitude = 37.33;
  const longitude = -121.88;
  const radiusMeters = 100;
  const circle = `within_circle(the_geom,${latitude},${longitude},${radiusMeters})`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const where = url.searchParams.get("$where") ?? "";

    if (where === circle) {
      assert.equal(url.searchParams.get("$limit"), "3");
      return Response.json([
        { objectid: "1", apn: "111" },
        { objectid: "2", apn: "222" },
        { objectid: "3", apn: "333" },
      ]);
    }

    return Response.json([]);
  };

  try {
    const result = await searchSantaClaraParcelsInRadius({
      latitude,
      longitude,
      radiusMeters,
      limit: 2,
    });

    assert.equal(result.truncated, true);
    assert.deepEqual(
      result.parcels.map((parcel) => parcel.apn),
      ["111", "222"]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("roof-age address lookup asks the county dataset by APN", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const where = url.searchParams.get("$where") ?? "";
    assert.equal(where.includes("within_circle"), false);
    assert.match(where, /apn in\('67620085','46204039'\)/);
    return Response.json([
      {
        objectid: "1",
        apn: "67620085",
        situs_house_number: "3350",
        situs_street_name: "KETTMANN",
        situs_street_type: "RD",
        situs_city_name: "SAN JOSE",
        situs_state_code: "CA",
        situs_zip_code: "95121-1221",
      },
    ]);
  };

  try {
    const addresses = await lookupSantaClaraParcelAddresses([
      "67620085",
      "462-04039",
      "67620085",
    ]);
    assert.deepEqual(addresses, {
      "67620085": "3350 KETTMANN RD, SAN JOSE CA 95121-1221",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the map page stops at 500 and the open-permit empty state names All", () => {
  const routeSource = readFileSync(
    new URL("../src/app/api/parcels/search/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /const PARCEL_PAGE_LIMIT = 500/);
  assert.match(dashboardSource, /mapOverlaySentence\(/);
  assert.match(dashboardSource, /drawnCount: parcels\.length/);
  assert.match(dashboardSource, /matchCount: listedParcels\.length/);
  assert.equal(
    dashboardSource.includes("This map displays a maximum of"),
    false
  );
  assert.match(dashboardSource, /Choose All roofing permits to see them/);
  assert.match(dashboardSource, /writeSavedLeads/);
});
