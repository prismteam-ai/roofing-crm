export function permitAgeYears(issueDate: string | null, now = Date.now()) {
  if (!issueDate) return null;

  const issued = new Date(`${issueDate}T00:00:00Z`);
  if (Number.isNaN(issued.valueOf())) return null;

  return Math.max(
    0,
    (now - issued.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
}

export function isLongOpenPermit(finalDate: string | null, age: number | null) {
  return !finalDate && age !== null && age >= 5;
}

export function apnBatches(apns: readonly string[], size = 100) {
  const batches: string[][] = [];

  for (let index = 0; index < apns.length; index += size) {
    batches.push(apns.slice(index, index + size));
  }

  return batches;
}

type ListedPermit = {
  apn: string;
  finalDate?: string | null;
  issueDate?: string | null;
};

function permitMeetsOpenDuration(
  permit: ListedPermit,
  minimumOpenYears: number,
  now: number
) {
  const age = permitAgeYears(permit.issueDate ?? null, now);
  return !permit.finalDate && age !== null && age >= minimumOpenYears;
}

export function parcelsForPermitStatus<T extends { apn: string }>(
  roofAgeMatches: readonly T[],
  permits: readonly ListedPermit[],
  permitStatus: "open" | "all",
  radiusParcels: readonly T[] = roofAgeMatches,
  minimumOpenYears: number | null = null,
  now = Date.now()
) {
  const pool = permitStatus === "open" ? radiusParcels : roofAgeMatches;

  return pool.filter((parcel) => {
    const parcelPermits = permits.filter((permit) => permit.apn === parcel.apn);

    if (permitStatus === "open" && parcelPermits.length === 0) return false;
    if (minimumOpenYears === null) return true;

    return parcelPermits.some((permit) =>
      permitMeetsOpenDuration(permit, minimumOpenYears, now)
    );
  });
}

function oldestOpenPermitAge(
  permits: readonly ListedPermit[],
  now: number
) {
  const byApn = new Map<string, number | null>();

  for (const permit of permits) {
    if (permit.finalDate) continue;

    const age = permitAgeYears(permit.issueDate ?? null, now);
    const current = byApn.get(permit.apn);
    if (current === undefined) {
      byApn.set(permit.apn, age);
      continue;
    }

    if (age !== null && (current === null || age > current)) {
      byApn.set(permit.apn, age);
    }
  }

  return byApn;
}

export function sortParcelsLongOpenFirst<T extends { apn: string }>(
  parcels: readonly T[],
  permits: readonly ListedPermit[],
  now = Date.now()
) {
  const openAgeByApn = oldestOpenPermitAge(permits, now);

  return parcels
    .map((parcel, index) => {
      const age = openAgeByApn.get(parcel.apn);
      return {
        parcel,
        index,
        group: age === undefined ? 2 : age === null ? 1 : 0,
        age: age ?? 0,
      };
    })
    .sort(
      (left, right) =>
        left.group - right.group ||
        right.age - left.age ||
        left.index - right.index
    )
    .map((entry) => entry.parcel);
}

export type ParcelMarkerKind = "match" | "longOpen" | "rest";

export function parcelMarkerKind<T extends { apn: string }>(
  parcel: { apn: string },
  listedParcels: readonly T[],
  permits: readonly ListedPermit[],
  now = Date.now()
): ParcelMarkerKind {
  const longOpen = permits.some(
    (permit) =>
      permit.apn === parcel.apn &&
      isLongOpenPermit(
        permit.finalDate ?? null,
        permitAgeYears(permit.issueDate ?? null, now)
      )
  );
  if (longOpen) return "longOpen";
  if (listedParcels.some((listed) => listed.apn === parcel.apn)) {
    return "match";
  }
  return "rest";
}

export function mapOverlaySentence(input: {
  drawnCount: number;
  matchCount: number;
  truncated: boolean;
  pageLimit: number;
  permitsLoading: boolean;
}) {
  const houseWord = input.drawnCount === 1 ? "house" : "houses";
  const drawn = `Showing ${input.drawnCount} ${houseWord} in this radius.`;
  const cap = input.truncated
    ? ` The map shows the first ${input.pageLimit} parcels plus any extra parcels in the circle whose snapshot roof age is at least 15 years.`
    : "";

  if (input.permitsLoading) {
    return `${drawn} San Jose permits are still loading.${cap}`;
  }

  const matchWord = input.matchCount === 1 ? "matches" : "match";
  return `${drawn} ${input.matchCount} ${matchWord} the current filters.${cap}`;
}

export const BBB_RATING_UNAVAILABLE = "BBB rating unavailable";
export const NO_PERMIT_RETURNED =
  "No roofing permit was returned for this parcel.";
export const SAN_JOSE_PERMITS_ONLY =
  "Roofing permits are only loaded for San Jose.";
export const NO_CONTRACTOR_RETURNED = "No contractor was returned";

export function jurisdictionLoadsRoofingPermits(
  jurisdiction: string | null | undefined
) {
  return jurisdiction?.trim().toUpperCase() === "SAN JOSE";
}

export type SelectedPermitSource = {
  permitNumber: string;
  status: string | null;
  layerName: string;
  issueDate: string | null;
  finalDate: string | null;
  contractorName: string | null;
  description?: string | null;
  estimatedValue?: number | null;
};

export type SelectedPermitDetail = {
  permitNumber: string;
  status: string;
  yearsSinceIssue: number | null;
  durationLabel: string;
  longOpen: boolean;
  contractorLabel: string;
  description?: string;
  estimatedValueLabel?: string;
  issueDate?: string;
  finalDate?: string;
};

function returnedText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatEstimatedValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export type SelectedParcelPermitView = {
  permits: SelectedPermitDetail[];
  noPermitMessage: string | null;
  bbbRating: typeof BBB_RATING_UNAVAILABLE;
};

export function selectedParcelPermitView(
  permits: readonly SelectedPermitSource[],
  now = Date.now(),
  jurisdiction?: string | null
): SelectedParcelPermitView {
  if (permits.length === 0) {
    return {
      permits: [],
      noPermitMessage:
        jurisdiction !== undefined &&
        !jurisdictionLoadsRoofingPermits(jurisdiction)
          ? SAN_JOSE_PERMITS_ONLY
          : NO_PERMIT_RETURNED,
      bbbRating: BBB_RATING_UNAVAILABLE,
    };
  }

  return {
    permits: permits.map((permit) => {
      const yearsSinceIssue = permitAgeYears(permit.issueDate, now);
      const contractor = permit.contractorName?.trim();
      const detail: SelectedPermitDetail = {
        permitNumber: permit.permitNumber,
        status:
          permit.status?.trim() || permit.layerName || "Status unavailable",
        yearsSinceIssue,
        durationLabel:
          yearsSinceIssue === null
            ? "Years since issue unavailable"
            : `${yearsSinceIssue.toFixed(1)} years since issue`,
        longOpen: isLongOpenPermit(permit.finalDate, yearsSinceIssue),
        contractorLabel: contractor ? contractor : NO_CONTRACTOR_RETURNED,
      };
      const description = returnedText(permit.description);
      const issueDate = returnedText(permit.issueDate);
      const finalDate = returnedText(permit.finalDate);

      if (description) detail.description = description;
      if (
        typeof permit.estimatedValue === "number" &&
        Number.isFinite(permit.estimatedValue)
      ) {
        detail.estimatedValueLabel = formatEstimatedValue(permit.estimatedValue);
      }
      if (issueDate) detail.issueDate = issueDate;
      if (finalDate) detail.finalDate = finalDate;

      return detail;
    }),
    noPermitMessage: null,
    bbbRating: BBB_RATING_UNAVAILABLE,
  };
}
