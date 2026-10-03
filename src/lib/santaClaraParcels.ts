import { loadRoofAgeSnapshot } from "./loadRoofAgeSnapshot.ts";
import {
  meetsMinimumRoofAge,
  undashedApn,
} from "./roofAgeProof.ts";

const DATASET_URL = "https://data.sccgov.org/resource/ubcd-cewv.json";
const DATASET_ID = "ubcd-cewv";
const MINIMUM_ROOF_AGE_YEARS = 15;
const PARCEL_SELECT = [
  "objectid",
  "apn",
  "jurisdiction",
  "situs_house_number",
  "situs_street_direction",
  "situs_street_name",
  "situs_street_type",
  "situs_unit_number",
  "situs_city_name",
  "situs_state_code",
  "situs_zip_code",
  "the_geom",
].join(",");

type Coordinate = unknown;

type SocrataParcel = {
  objectid?: string;
  apn?: string;
  jurisdiction?: string;
  situs_house_number?: string;
  situs_street_direction?: string;
  situs_street_name?: string;
  situs_street_type?: string;
  situs_unit_number?: string;
  situs_city_name?: string;
  situs_state_code?: string;
  situs_zip_code?: string;
  the_geom?: {
    type?: string;
    coordinates?: Coordinate;
  };
};

export type ParcelSearchResult = {
  objectId: string;
  apn: string;
  address: string;
  jurisdiction: string | null;
  latitude: number | null;
  longitude: number | null;
  source: {
    datasetId: string;
    datasetUrl: string;
  };
};

function collectPoints(value: unknown, points: [number, number][]) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    points.push([value[0], value[1]]);
    return;
  }

  for (const child of value) {
    collectPoints(child, points);
  }
}

function representativePoint(
  coordinates: unknown
): { latitude: number; longitude: number } | null {
  const points: [number, number][] = [];
  collectPoints(coordinates, points);

  if (points.length === 0) {
    return null;
  }

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

function formatAddress(parcel: SocrataParcel) {
  const street = [
    parcel.situs_house_number,
    parcel.situs_street_direction,
    parcel.situs_street_name,
    parcel.situs_street_type,
    parcel.situs_unit_number,
  ]
    .filter(Boolean)
    .join(" ");

  const locality = [
    parcel.situs_city_name,
    parcel.situs_state_code,
    parcel.situs_zip_code,
  ]
    .filter(Boolean)
    .join(" ");

  return [street, locality].filter(Boolean).join(", ");
}

function withinCircleWhere(
  latitude: number,
  longitude: number,
  radiusMeters: number
) {
  return `within_circle(the_geom,${latitude},${longitude},${radiusMeters})`;
}

let snapshotApnsMeetingMinimumRoofAge: readonly string[] | null = null;

async function qualifyingSnapshotApns() {
  if (snapshotApnsMeetingMinimumRoofAge) {
    return snapshotApnsMeetingMinimumRoofAge;
  }

  const snapshot = await loadRoofAgeSnapshot();
  snapshotApnsMeetingMinimumRoofAge = Object.keys(snapshot.parcels).filter(
    (apn) => meetsMinimumRoofAge(apn, MINIMUM_ROOF_AGE_YEARS)
  );

  return snapshotApnsMeetingMinimumRoofAge;
}

function quotedDatasetApn(apn: string) {
  const spelled = undashedApn(apn);

  if (!/^\d+$/.test(spelled)) {
    throw new Error(`Santa Clara APN is not stored as undashed digits: ${apn}`);
  }

  return `'${spelled}'`;
}

function mergeParcelsByUndashedApn(
  parcels: readonly ParcelSearchResult[],
  extra: readonly ParcelSearchResult[]
) {
  const seen = new Set(parcels.map((parcel) => undashedApn(parcel.apn)));
  const merged = [...parcels];

  for (const parcel of extra) {
    const key = undashedApn(parcel.apn);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(parcel);
  }

  return merged;
}

async function querySantaClaraParcels(
  where: string,
  limit: number
): Promise<ParcelSearchResult[]> {
  const url = new URL(DATASET_URL);

  url.searchParams.set("$select", PARCEL_SELECT);
  url.searchParams.set("$where", where);
  url.searchParams.set("$limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Santa Clara parcel query failed with HTTP ${response.status}`
    );
  }

  const rows = (await response.json()) as SocrataParcel[];

  return rows
    .filter((row) => row.objectid && row.apn)
    .map((row) => {
      const point = representativePoint(row.the_geom?.coordinates);

      return {
        objectId: row.objectid!,
        apn: row.apn!,
        address: formatAddress(row),
        jurisdiction: row.jurisdiction ?? null,
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
        source: {
          datasetId: DATASET_ID,
          datasetUrl: DATASET_URL,
        },
      };
    });
}

export async function lookupSantaClaraParcelAddresses(
  apns: readonly string[]
): Promise<Record<string, string>> {
  const quoted: string[] = [];
  const seen = new Set<string>();

  for (const apn of apns) {
    const spelled = undashedApn(apn);
    if (!/^\d+$/.test(spelled) || seen.has(spelled)) continue;
    seen.add(spelled);
    quoted.push(`'${spelled}'`);
  }

  if (quoted.length === 0) return {};

  const parcels = await querySantaClaraParcels(
    `apn in(${quoted.join(",")})`,
    quoted.length
  );
  const addresses: Record<string, string> = {};

  for (const parcel of parcels) {
    if (!parcel.address) continue;
    addresses[undashedApn(parcel.apn)] = parcel.address;
  }

  return addresses;
}

export async function searchSantaClaraParcels({
  latitude,
  longitude,
  radiusMeters,
  limit,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
}): Promise<ParcelSearchResult[]> {
  return querySantaClaraParcels(
    withinCircleWhere(latitude, longitude, radiusMeters),
    limit
  );
}

async function searchQualifyingRoofAgeParcelsInCircle({
  latitude,
  longitude,
  radiusMeters,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}) {
  const apns = (await qualifyingSnapshotApns()).map(quotedDatasetApn);
  if (apns.length === 0) return [];

  return querySantaClaraParcels(
    `${withinCircleWhere(latitude, longitude, radiusMeters)} AND apn in(${apns.join(",")})`,
    apns.length
  );
}

export async function searchSantaClaraParcelsInRadius({
  latitude,
  longitude,
  radiusMeters,
  limit,
}: {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  limit: number;
}): Promise<{ parcels: ParcelSearchResult[]; truncated: boolean }> {
  const page = await searchSantaClaraParcels({
    latitude,
    longitude,
    radiusMeters,
    limit: limit + 1,
  });
  const truncated = page.length > limit;
  const visiblePage = truncated ? page.slice(0, limit) : page;
  const qualifying = await searchQualifyingRoofAgeParcelsInCircle({
    latitude,
    longitude,
    radiusMeters,
  });

  return {
    parcels: mergeParcelsByUndashedApn(visiblePage, qualifying),
    truncated,
  };
}
