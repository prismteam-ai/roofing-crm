const MAP_SERVER =
  "https://geo.sanjoseca.gov/server/rest/services/PLN/PLN_PermitsAndComplaints/MapServer";

const LAYERS = [
  { id: 7, name: "Recent Building Permit (30 Days)" },
  { id: 8, name: "Active Building Permit" },
  { id: 9, name: "Expired Building Permit" },
] as const;

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
};

export type RoofingPermit = {
  apn: string;
  permitNumber: string;
  description: string | null;
  status: string | null;
  issueDate: string | null;
  finalDate: string | null;
  contractorName: string | null;
  applicantName: string | null;
  address: string | null;
  estimatedValue: number | null;
  layerId: number;
  layerName: string;
  sourceUrl: string;
};

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function date(value: unknown) {
  if (value == null || value === "") return null;

  const parsed =
    typeof value === "number"
      ? new Date(value)
      : new Date(String(value));

  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function money(value: unknown) {
  if (value == null || value === "") return null;

  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isRoofingPermit(...values: unknown[]) {
  return values.some((value) =>
    /roof|reroof|re-roof|shingle/i.test(String(value ?? ""))
  );
}

function normalizeApn(value: string) {
  const normalized = value.replace(/-/g, "").trim();

  if (!/^\d{8}$/.test(normalized)) {
    throw new Error(`Invalid Santa Clara APN: ${value}`);
  }

  return normalized;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function queryLayer(
  layerId: number,
  layerName: string,
  apns: string[]
): Promise<RoofingPermit[]> {
  if (apns.length === 0) return [];

  const sourceUrl = `${MAP_SERVER}/${layerId}`;
  const url = new URL(`${sourceUrl}/query`);

  url.searchParams.set("f", "json");
  url.searchParams.set(
    "where",
    `APN IN (${apns.map(sqlLiteral).join(",")})`
  );
  url.searchParams.set(
    "outFields",
    [
      "OBJECTID",
      "FOLDERNUM",
      "WORKDESC",
      "SUBDESC",
      "PERMITAPPROVAL",
      "ADDRESS",
      "APN",
      "ISSUEDATEUTC",
      "ISSUEDATE",
      "FINALDATEUTC",
      "FINALDATE",
      "PERMITVALUE",
      "CONTRACTOR",
      "APPLICANT",
    ].join(",")
  );
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("resultRecordCount", "2000");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `San Jose permit layer ${layerId} failed with HTTP ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    features?: ArcGisFeature[];
    exceededTransferLimit?: boolean;
  };

  if (payload.error) {
    throw new Error(
      `San Jose permit layer ${layerId} failed: ${
        payload.error.message ?? "unknown ArcGIS error"
      }`
    );
  }

  if (payload.exceededTransferLimit) {
    throw new Error(
      `San Jose permit layer ${layerId} exceeded the ArcGIS transfer limit`
    );
  }

  const results: RoofingPermit[] = [];

  for (const feature of payload.features ?? []) {
    const attributes = feature.attributes ?? {};

    const apnRaw = text(attributes.APN);
    const permitNumber = text(attributes.FOLDERNUM);

    if (!apnRaw || !permitNumber) continue;

    let apn: string;
    try {
      apn = normalizeApn(apnRaw);
    } catch {
      continue;
    }

    if (!apns.includes(apn)) continue;

    const workDescription = text(attributes.WORKDESC);
    const subDescription = text(attributes.SUBDESC);

    if (
      !isRoofingPermit(
        workDescription,
        subDescription,
        `${workDescription ?? ""} ${subDescription ?? ""}`
      )
    ) {
      continue;
    }

    results.push({
      apn,
      permitNumber,
      description:
        [workDescription, subDescription].filter(Boolean).join(" | ") || null,
      status: text(attributes.PERMITAPPROVAL),
      issueDate:
        date(attributes.ISSUEDATEUTC) ?? date(attributes.ISSUEDATE),
      finalDate:
        date(attributes.FINALDATEUTC) ?? date(attributes.FINALDATE),
      contractorName: text(attributes.CONTRACTOR),
      applicantName: text(attributes.APPLICANT),
      address: text(attributes.ADDRESS),
      estimatedValue: money(attributes.PERMITVALUE),
      layerId,
      layerName,
      sourceUrl,
    });
  }

  return results;
}

export async function searchSanJoseRoofingPermits({
  apns,
  permitStatus,
}: {
  apns: string[];
  permitStatus: "open" | "all";
}) {
  const normalizedApns = [...new Set(apns.map(normalizeApn))];

  const selectedLayers =
    permitStatus === "open"
      ? LAYERS.filter((layer) => layer.id === 8)
      : LAYERS;

  const batches = await Promise.all(
    selectedLayers.map((layer) =>
      queryLayer(layer.id, layer.name, normalizedApns)
    )
  );

  const permits = batches.flat();

  return [
    ...new Map(
      permits.map((permit) => [permit.permitNumber, permit])
    ).values(),
  ];
}
