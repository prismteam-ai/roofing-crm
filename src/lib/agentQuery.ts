import { permitAgeYears } from "./candidateList.ts";
import {
  meetsMinimumRoofAge,
  roofAgeCardLabel,
  undashedApn,
  type RoofAgeSnapshotRow,
} from "./roofAgeProof.ts";

export type AgentParcel = {
  apn: string;
  address: string;
};

export type AgentPermit = {
  apn: string;
  permitNumber: string;
  finalDate: string | null;
  issueDate: string | null;
  contractorName: string | null;
};

export type AgentMatch = {
  apn: string;
  address: string;
  detail: string;
};

export type AgentAnswer = {
  answer: string;
  matches: AgentMatch[];
};

const BBB_NOTE = "BBB rating is unavailable in the current data.";
const ROOF_BASIS =
  "Roof age is the years since the completed re-roof date in the published snapshot.";
const PERMIT_BASIS =
  "Open means no final date. Duration is the years since the San Jose issue date. The contractor is the name on that permit.";
const DATA_OVERVIEW =
  "This CRM searches Santa Clara County parcels inside a radius. Roof age comes from the published snapshot of completed San Jose re-roof permits. Roofing permits are loaded for San Jose only. Owner name, sale date, year built, and BBB rating are not in this data.";
const NEED_A_PLACE =
  "Drop a pin or name a Santa Clara city. Radius answers use the parcels and San Jose permits loaded for that search.";

export const SANTA_CLARA_CITY_CENTERS = [
  { name: "San Jose", lat: 37.3382, lng: -121.8863 },
  { name: "Santa Clara", lat: 37.3541, lng: -121.9552 },
  { name: "Sunnyvale", lat: 37.3688, lng: -122.0363 },
  { name: "Mountain View", lat: 37.3861, lng: -122.0839 },
  { name: "Palo Alto", lat: 37.4419, lng: -122.143 },
  { name: "Milpitas", lat: 37.4323, lng: -121.8996 },
  { name: "Cupertino", lat: 37.323, lng: -122.0322 },
  { name: "Campbell", lat: 37.2872, lng: -121.95 },
  { name: "Los Gatos", lat: 37.2358, lng: -121.9624 },
  { name: "Saratoga", lat: 37.2638, lng: -122.023 },
  { name: "Morgan Hill", lat: 37.1305, lng: -121.6544 },
  { name: "Gilroy", lat: 37.0058, lng: -121.5683 },
] as const;

const SEARCH_RADIUS_MILES = new Set([1, 3, 5, 10, 25]);

const PLACE_STOP = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "my",
  "our",
  "your",
  "me",
  "open",
  "roofing",
  "roof",
  "roofs",
  "permit",
  "permits",
  "property",
  "properties",
  "parcel",
  "parcels",
  "year",
  "years",
  "mile",
  "miles",
  "search",
  "radius",
  "area",
  "current",
  "loaded",
  "older",
  "than",
  "within",
  "show",
  "one",
  "two",
  "three",
  "four",
  "five",
  "ten",
  "fifteen",
  "twenty",
  "twenty-five",
]);

export type QuestionPlace =
  | {
      kind: "known";
      name: string;
      lat: number;
      lng: number;
      radiusMiles: number | null;
    }
  | { kind: "unknown"; name: string }
  | { kind: "none" };

function cityPattern(name: string) {
  return new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "gi");
}

function cityHits(question: string) {
  const hits: {
    name: string;
    lat: number;
    lng: number;
    index: number;
  }[] = [];

  for (const city of SANTA_CLARA_CITY_CENTERS) {
    for (const match of question.matchAll(cityPattern(city.name))) {
      const index = match.index ?? 0;
      const after = question.slice(index + match[0].length);
      if (/^\s+county\b/i.test(after)) continue;

      hits.push({
        name: city.name,
        lat: city.lat,
        lng: city.lng,
        index,
      });
    }
  }

  return hits.sort((left, right) => left.index - right.index);
}

function isPlacePhrase(question: string, index: number) {
  return /\b(?:of|near|around|in)\s+$/i.test(question.slice(0, index));
}

export function questionSearchPlace(question: string): QuestionPlace {
  const trimmed = question.trim();
  const hits = cityHits(trimmed);

  if (hits.length > 0) {
    const placed = hits.filter((hit) => isPlacePhrase(trimmed, hit.index));
    const chosen = placed.length > 0 ? placed[placed.length - 1] : hits[0];
    const askedMiles = askedRadiusMiles(trimmed);

    return {
      kind: "known",
      name: chosen.name,
      lat: chosen.lat,
      lng: chosen.lng,
      radiusMiles:
        askedMiles !== null && SEARCH_RADIUS_MILES.has(askedMiles)
          ? askedMiles
          : null,
    };
  }

  const unknown = unknownPlaceName(trimmed);
  if (unknown) return { kind: "unknown", name: unknown };

  return { kind: "none" };
}

function unknownPlaceName(question: string) {
  const pattern =
    /\b(?:of|near|around|in)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/gi;

  for (const match of question.matchAll(pattern)) {
    const name = match[1].trim();
    const after = question.slice((match.index ?? 0) + match[0].length);
    if (/^\s+county\b/i.test(after)) continue;
    if (PLACE_STOP.has(name.split(/\s+/)[0].toLowerCase())) continue;
    if (
      SANTA_CLARA_CITY_CENTERS.some(
        (city) => city.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      continue;
    }
    return name;
  }

  return null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  "twenty-five": 25,
};

function askedRadiusMiles(question: string) {
  const fromPhrase = firstQuantity(question, "mile");
  if (fromPhrase !== null) return fromPhrase;

  const singular = question.match(/\b(25|10|5|3|1)\s+mile\b/i);
  return singular ? Number(singular[1]) : null;
}

function firstQuantity(question: string, unit: "mile" | "year") {
  const digits = question.match(
    new RegExp(`(\\d+)\\s*-?\\s*${unit}s?\\b`, "i")
  );
  if (digits) {
    const value = Number(digits[1]);
    return Number.isFinite(value) ? value : null;
  }

  const words = question.match(
    new RegExp(
      `(twenty-five|fifteen|twenty|ten|five|four|three|two|one)\\s*-?\\s*${unit}s?\\b`,
      "i"
    )
  );
  if (!words) return null;

  return NUMBER_WORDS[words[1].toLowerCase()] ?? null;
}

function questionIntent(question: string) {
  const askedYears = firstQuantity(question, "year");
  const asksOpenPermit =
    /\bopen\b/i.test(question) && /\bpermits?\b/i.test(question);
  const asksRoof = /\broofs?\b/i.test(question) && !asksOpenPermit;

  return { askedYears, asksOpenPermit, asksRoof };
}

export type QuestionListFilters = {
  roofAge: number | null;
  permitStatus: "open" | "all";
  minimumOpenYears: number | null;
};

type GeneralTopic = "owner" | "bbb" | "cities" | "data" | "roof" | "permit";

export function questionIsGeneral(question: string) {
  return explanatoryTopic(question.trim()) !== null;
}

function explanatoryTopic(question: string): GeneralTopic | null {
  if (
    /\b(owner|owners|ownership|sale date|sold|mailing address|year built)\b/i.test(
      question
    )
  ) {
    return "owner";
  }

  if (/\bbbb\b/i.test(question)) return "bbb";

  if (
    /\b(which cities|what cities|city list|where can i search)\b/i.test(
      question
    )
  ) {
    return "cities";
  }

  if (
    /\b(what data|what information|what can you|what do you know|what records)\b/i.test(
      question
    )
  ) {
    return "data";
  }

  const defines =
    /\b(what is|what does|how is|how are|how do you|explain|how old)\b/i.test(
      question
    );
  const lists = /\b(show|list|find|which)\b/i.test(question);
  if (defines && !lists && /\broof age\b|\broofs?\b/i.test(question)) {
    return "roof";
  }

  if (defines && !lists && /\b(open|permits?)\b/i.test(question)) {
    return "permit";
  }

  return null;
}

function generalAnswer(topic: GeneralTopic): AgentAnswer {
  if (topic === "owner") {
    return {
      answer:
        "Owner name, sale date, mailing address, and year built are not in the county parcel records this CRM uses.",
      matches: [],
    };
  }

  if (topic === "bbb") {
    return {
      answer: `${BBB_NOTE} No BBB score is included with the permits.`,
      matches: [],
    };
  }

  if (topic === "cities") {
    const names = SANTA_CLARA_CITY_CENTERS.map((city) => city.name).join(", ");
    return {
      answer: `You can name these Santa Clara County cities: ${names}. You can also drop a pin. Radius choices are 1, 3, 5, 10, and 25 miles.`,
      matches: [],
    };
  }

  if (topic === "roof") {
    return {
      answer: `${ROOF_BASIS} The snapshot covers accepted completed San Jose re-roofs. A parcel with no dated replacement has no publicly available roof age. Name a city or drop a pin to list roofs inside a radius.`,
      matches: [],
    };
  }

  if (topic === "permit") {
    return {
      answer: `${PERMIT_BASIS} Open uses San Jose's active permit layer. Permits for other cities are not loaded. Name a city or drop a pin to list permits inside a radius. ${BBB_NOTE}`,
      matches: [],
    };
  }

  return { answer: DATA_OVERVIEW, matches: [] };
}

export function questionNeedsLoadedSearch(question: string) {
  if (explanatoryTopic(question.trim())) return false;

  const { asksOpenPermit, asksRoof } = questionIntent(question);
  if (asksOpenPermit) return true;
  if (!asksRoof) return false;

  return /\b(within|near|around|miles?|radius|this search|this area)\b/i.test(
    question
  );
}

export function questionListFilters(
  question: string
): QuestionListFilters | null {
  const trimmed = question.trim();
  if (!trimmed) return null;
  if (explanatoryTopic(trimmed)) return null;
  if (questionSearchPlace(trimmed).kind === "unknown") return null;

  const { askedYears, asksOpenPermit, asksRoof } = questionIntent(trimmed);
  if (!asksOpenPermit && !asksRoof) return null;

  if (asksOpenPermit) {
    return {
      roofAge: null,
      permitStatus: "open",
      minimumOpenYears: askedYears,
    };
  }

  return {
    roofAge: askedYears ?? 15,
    permitStatus: "all",
    minimumOpenYears: null,
  };
}

function mileLabel(miles: number) {
  return `${miles} ${miles === 1 ? "mile" : "miles"}`;
}

function searchLabel(miles: number) {
  return `${miles}-mile search`;
}

function loadedRadiusNote(askedMiles: number | null, loadedMiles: number) {
  if (askedMiles === null || askedMiles === loadedMiles) return "";

  if (askedMiles > loadedMiles) {
    return ` The loaded search covers ${mileLabel(loadedMiles)}, which is smaller than the ${mileLabel(askedMiles)} asked.`;
  }

  return ` The loaded search covers ${mileLabel(loadedMiles)}, which is larger than the ${mileLabel(askedMiles)} asked, so this list is not limited to ${mileLabel(askedMiles)}.`;
}

const ADDRESS_NOT_IN_SNAPSHOT = "Address not in the published snapshot";
const ADDRESS_NOT_RETURNED =
  "Street address was not returned by Santa Clara County parcel records.";

function snapshotRoofAnswer(
  question: string,
  roofAges: Readonly<Record<string, RoofAgeSnapshotRow>> | undefined,
  addressesByApn?: Readonly<Record<string, string>>
): AgentAnswer {
  const minimumYears = firstQuantity(question, "year") ?? 15;
  const rows = Object.entries(roofAges ?? {}).filter(([, row]) => {
    return (
      typeof row.roof_age_years === "number" &&
      row.roof_age_years >= minimumYears
    );
  });

  let located = 0;
  const matches = rows
    .sort(
      (left, right) =>
        (right[1].roof_age_years ?? 0) - (left[1].roof_age_years ?? 0)
    )
    .map(([apn]) => {
      const fromCounty = addressesByApn?.[undashedApn(apn)];
      if (fromCounty) located += 1;

      return {
        apn,
        address: fromCounty
          ? fromCounty
          : addressesByApn
            ? ADDRESS_NOT_RETURNED
            : ADDRESS_NOT_IN_SNAPSHOT,
        detail: `${roofAgeCardLabel(apn)}. ${BBB_NOTE}`,
      };
    });

  const yearLabel = `${minimumYears} ${minimumYears === 1 ? "year" : "years"}`;
  const countLabel =
    matches.length === 1
      ? "1 parcel in the published San Jose snapshot has"
      : `${matches.length} parcels in the published San Jose snapshot have`;
  const addressNote = !addressesByApn
    ? "The snapshot does not include street addresses."
    : located === matches.length
      ? "Street addresses are the situs address from Santa Clara County parcel records."
      : located === 0
        ? "Santa Clara County parcel records did not return street addresses for these parcels."
        : "Street addresses are included when Santa Clara County parcel records returned one.";

  return {
    answer:
      matches.length > 0
        ? `${countLabel} a roof age of at least ${yearLabel}. This is not a map-radius search. ${addressNote} ${ROOF_BASIS} ${BBB_NOTE}`
        : `No parcel in the published San Jose snapshot has a roof age of at least ${yearLabel}. This is not a map-radius search. ${ROOF_BASIS} ${BBB_NOTE}`,
    matches,
  };
}

function parcelForPermit(
  parcels: readonly AgentParcel[],
  apn: string
) {
  const key = undashedApn(apn);
  return parcels.find((parcel) => undashedApn(parcel.apn) === key);
}

export function answerRoofingQuestion(
  question: string,
  input: {
    parcels: readonly AgentParcel[];
    permits: readonly AgentPermit[];
    radiusMiles: number | null;
    hasSearched: boolean;
    permitError?: string | null;
    permitStatus?: "open" | "all" | null;
    truncated?: boolean;
    now?: number;
    roofAges?: Readonly<Record<string, RoofAgeSnapshotRow>>;
    addressesByApn?: Readonly<Record<string, string>>;
  }
): AgentAnswer {
  const trimmed = question.trim();

  if (!trimmed) {
    return {
      answer:
        "Ask a general question about the roof-age snapshot or San Jose permits, or name a city to search a radius.",
      matches: [],
    };
  }

  const topic = explanatoryTopic(trimmed);
  if (topic) return generalAnswer(topic);

  const place = questionSearchPlace(trimmed);
  if (place.kind === "unknown") {
    return {
      answer: `${place.name} is not in the Santa Clara County city list, so no search was run.`,
      matches: [],
    };
  }

  if (!input.hasSearched || input.radiusMiles === null) {
    const { asksOpenPermit, asksRoof } = questionIntent(trimmed);
    if (asksRoof && !questionNeedsLoadedSearch(trimmed)) {
      return snapshotRoofAnswer(trimmed, input.roofAges, input.addressesByApn);
    }

    if (asksOpenPermit || asksRoof) {
      return {
        answer: asksRoof
          ? `${NEED_A_PLACE} ${ROOF_BASIS}`
          : `${NEED_A_PLACE} ${PERMIT_BASIS}`,
        matches: [],
      };
    }

    return { answer: DATA_OVERVIEW, matches: [] };
  }

  const askedMiles = firstQuantity(trimmed, "mile");
  const { askedYears, asksOpenPermit, asksRoof } = questionIntent(trimmed);
  const radiusNote = loadedRadiusNote(askedMiles, input.radiusMiles);
  const coverageNote = input.truncated
    ? " The county returned more parcels than this page, so this answer covers only the parcels that were loaded."
    : "";

  if (!asksOpenPermit && !asksRoof) {
    return {
      answer: `Ask about roofs older than a number of years, or open roofing permits older than a number of years, inside this ${input.radiusMiles}-mile search. ${BBB_NOTE}`,
      matches: [],
    };
  }

  if (asksOpenPermit) {
    const minimumYears = askedYears;

    if (input.permitError) {
      return {
        answer: `Permit records did not load for this search (${input.permitError}). ${BBB_NOTE}`,
        matches: [],
      };
    }

    const seenPermitNumbers = new Set<string>();
    const matches = input.permits.flatMap((permit) => {
      if (seenPermitNumbers.has(permit.permitNumber)) return [];

      const age = permitAgeYears(permit.issueDate, input.now);
      const open =
        !permit.finalDate &&
        (minimumYears === null || (age !== null && age >= minimumYears));
      if (!open) return [];

      seenPermitNumbers.add(permit.permitNumber);
      const parcel = parcelForPermit(input.parcels, permit.apn);
      if (!parcel) return [];

      const contractor = permit.contractorName?.trim();
      const duration =
        age === null
          ? "issue date was not returned"
          : `${age.toFixed(1)} years since issue`;

      return [
        {
          apn: parcel.apn,
          address: parcel.address || "Address unavailable",
          detail: `${permit.permitNumber}: ${duration}, no final date. Contractor: ${contractor || "none returned"}. ${BBB_NOTE}`,
        },
      ];
    });

    const layerNote =
      input.permitStatus === "open"
        ? " These permits are San Jose's active permit layer. Permits on the expired layer are not included."
        : input.permitStatus === "all"
          ? " These permits are every San Jose roofing permit returned for this search."
          : "";
    const loadedLabel = searchLabel(input.radiusMiles);
    const countLabel = `${matches.length} open roofing permit${matches.length === 1 ? "" : "s"}`;
    const found =
      minimumYears === null
        ? `${countLabel} in this ${loadedLabel} ${matches.length === 1 ? "has" : "have"} no final date.`
        : `${countLabel} in this ${loadedLabel} ${matches.length === 1 ? "has" : "have"} been open at least ${minimumYears} ${minimumYears === 1 ? "year" : "years"}.`;
    const none =
      minimumYears === null
        ? `No returned permit in this ${loadedLabel} is open.`
        : `No open roofing permit in this ${loadedLabel} has been open at least ${minimumYears} ${minimumYears === 1 ? "year" : "years"}.`;

    return {
      answer: `${matches.length > 0 ? found : none}${radiusNote}${coverageNote}${layerNote} ${PERMIT_BASIS} ${BBB_NOTE}`,
      matches,
    };
  }

  const minimumYears = askedYears ?? 15;
  const loadedLabel = searchLabel(input.radiusMiles);
  const matches = input.parcels.flatMap((parcel) => {
    if (!meetsMinimumRoofAge(parcel.apn, minimumYears)) return [];

    return [
      {
        apn: parcel.apn,
        address: parcel.address || "Address unavailable",
        detail: `${roofAgeCardLabel(parcel.apn)}. ${BBB_NOTE}`,
      },
    ];
  });

  return {
    answer:
      matches.length > 0
        ? `${matches.length} ${matches.length === 1 ? "parcel has a" : "parcels have"} roof age of at least ${minimumYears} ${minimumYears === 1 ? "year" : "years"} in this ${loadedLabel}.${radiusNote}${coverageNote} ${ROOF_BASIS} ${BBB_NOTE}`
        : `No loaded parcel in this ${loadedLabel} has a roof age of at least ${minimumYears} ${minimumYears === 1 ? "year" : "years"}.${radiusNote}${coverageNote} ${ROOF_BASIS} ${BBB_NOTE}`,
    matches,
  };
}
