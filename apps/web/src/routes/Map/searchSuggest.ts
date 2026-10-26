// Map search box logic (pure, no React): what the typed text is, and which suggestions the vendored
// Travis gazetteer gives for it. Exact permit / TCAD / street-address lookups go through the API
// (search.byPermitNumber, search.byTcadId, search.byAddress); `addressOptions` turns the address
// answer into listbox options.
import { gazetteer } from "@crm/oracle-views";

export type QueryKind = "empty" | "place" | "zip" | "permit" | "tcad" | "address";

export type SearchOptionKind = "place" | "zip" | "permit" | "tcad" | "address";

export interface SearchOption {
  /** Unique within one listbox; used for the option element id. */
  readonly id: string;
  readonly kind: SearchOptionKind;
  readonly label: string;
  /** Secondary line (what picking it does, or why it is disabled). */
  readonly detail?: string;
  readonly disabled?: boolean;
  /** Place and ZIP options: where the map centres. */
  readonly point?: { readonly lat: number; readonly lng: number };
  /** Permit and TCAD options: the value sent to the API. */
  readonly lookup?: string;
  /** Address matches: the property to open and where the map centres (no further lookup). */
  readonly property?: { readonly propertyCid: string; readonly lat: number; readonly lng: number };
}

/** The answer of search.byAddress, as the box needs it. */
export type AddressLookupResult =
  | {
      readonly found: true;
      readonly matches: readonly {
        readonly propertyCid: string;
        readonly requestIdentifier: string;
        readonly address: string;
        readonly lat: number;
        readonly lng: number;
      }[];
      readonly total: number;
      readonly runId: string | null;
    }
  | {
      readonly found: false;
      readonly runId: string | null;
      readonly reason?: "address_not_in_index";
    };

/** Shown under the gazetteer options. */
export const GAZETTEER_PROVENANCE = `Census 2024 Gazetteer · ${gazetteer.GAZETTEER_VERSION}`;

export const ADDRESS_NOT_IN_INDEX = "Street addresses are not in this index yet";

const PERMIT_RE = /^\d{4}-\d{6}(?:\s*BP)?$/i;
const ZIP_RE = /^(?:zip\s*)?\d{3,5}$/i;
const TCAD_RE = /^\d{6,8}$/;
const ADDRESS_RE = /^\d+\s+\p{L}/u;

/** What the text looks like. A 3-5 digit number is a ZIP (a 5-digit TCAD account that is not a
 *  ZIP is offered by `optionsFor`); 6-8 digits are a TCAD account. */
export function classifyQuery(text: string): QueryKind {
  const q = text.trim().replace(/\s+/g, " ");
  if (q === "") return "empty";
  if (PERMIT_RE.test(q)) return "permit";
  if (ZIP_RE.test(q)) return "zip";
  if (TCAD_RE.test(q)) return "tcad";
  if (ADDRESS_RE.test(q)) return "address";
  return "place";
}

/** The permit number as stored: `2026-121002 BP` (the suffix is added when omitted). */
export function normalisePermit(text: string): string {
  const digits = text.trim().slice(0, 11);
  return `${digits} BP`;
}

const MAX_GAZETTEER_OPTIONS = 6;

function zipDigits(text: string): string {
  return text.trim().replace(/^zip\s*/i, "");
}

function zipOption(found: Extract<ReturnType<typeof gazetteer.lookup>, { kind: "zcta" }>) {
  return {
    id: `zip-${found.zcta}`,
    kind: "zip" as const,
    label: found.zcta,
    detail: "ZIP code (ZCTA)",
    point: { lat: found.point.lat, lng: found.point.lon },
  };
}

/** Places whose name starts with the text, and ZIP codes (ZCTAs) starting with a 3-5 digit text.
 *  Only entries the gazetteer holds with coordinates are suggested. */
export function suggestFromGazetteer(query: string): SearchOption[] {
  const kind = classifyQuery(query);
  if (kind === "place") {
    return gazetteer
      .searchPlaces(query, MAX_GAZETTEER_OPTIONS)
      .filter((f) => f.kind === "place")
      .map((f) => ({
        id: `place-${f.geoid}`,
        kind: "place" as const,
        label: f.name,
        detail: f.partial_in_travis ? "Place, partly in Travis County" : "Place in Travis County",
        point: { lat: f.point.lat, lng: f.point.lon },
      }));
  }
  if (kind === "zip") {
    const digits = zipDigits(query);
    const span = 5 - digits.length;
    const start = Number(digits) * 10 ** span;
    const out: SearchOption[] = [];
    for (let i = 0; i < 10 ** span && out.length < MAX_GAZETTEER_OPTIONS; i += 1) {
      const found = gazetteer.lookup(String(start + i).padStart(5, "0"));
      if (found.status === "found" && found.kind === "zcta") out.push(zipOption(found));
    }
    return out;
  }
  return [];
}

/** What the box shows for an address answer: the matching properties as options (address text,
 *  then the TCAD account), or one plain disabled line saying why there are none. The run label
 *  comes from the answer; nothing is invented when it is missing. */
export function addressOptions(
  result: AddressLookupResult,
  runName: (runId: string) => string,
): { options: SearchOption[]; note: string | null } {
  if (result.found) {
    return {
      options: result.matches.map((m) => ({
        id: `address-${m.propertyCid}`,
        kind: "address" as const,
        label: m.address,
        detail: `TCAD ${m.requestIdentifier}`,
        property: { propertyCid: m.propertyCid, lat: m.lat, lng: m.lng },
      })),
      note: null,
    };
  }
  if (result.reason === "address_not_in_index") return { options: [], note: ADDRESS_NOT_IN_INDEX };
  const run = result.runId === null ? "the current run" : runName(result.runId);
  return { options: [], note: `No property at that address in ${run}` };
}

/** Everything the listbox shows for typed text (not the exact-lookup results, which are async). */
export function optionsFor(query: string): SearchOption[] {
  const q = query.trim().replace(/\s+/g, " ");
  switch (classifyQuery(q)) {
    case "empty":
      return [];
    case "place":
      return suggestFromGazetteer(q);
    case "zip": {
      const zips = suggestFromGazetteer(q);
      const digits = zipDigits(q);
      // A 5-digit number that is no Travis ZIP may still be a TCAD account number.
      if (zips.length === 0 && digits.length === 5 && !/^zip/i.test(q)) {
        return [tcadOption(digits)];
      }
      return zips;
    }
    case "permit": {
      const permit = normalisePermit(q);
      return [
        {
          id: `permit-${permit}`,
          kind: "permit",
          label: `Permit ${permit}`,
          detail: "Open the property this permit belongs to",
          lookup: permit,
        },
      ];
    }
    case "tcad":
      return [tcadOption(q)];
    case "address":
      // Typed addresses are answered by the API (the box debounces and calls search.byAddress);
      // this entry is only what a "Try" sample stands for: type it into the box.
      return [
        {
          id: `address-sample-${q}`,
          kind: "address",
          label: q,
          detail: "Search this street address",
          lookup: q,
        },
      ];
  }
}

function tcadOption(value: string): SearchOption {
  return {
    id: `tcad-${value}`,
    kind: "tcad",
    label: `TCAD account ${value}`,
    detail: "Open the property with this account number",
    lookup: value,
  };
}

export interface SearchSample {
  readonly label: string;
  /** What is typed into the box when the sample is picked. */
  readonly query: string;
  readonly verified: string;
}

/** "Try" examples for the empty box, the one list the box renders. The permit and TCAD samples are
 *  pinned to the data of Run 3: they are real rows in that run and must be re-checked (or removed)
 *  when a later run is promoted. The visible labels carry no run number.
 *
 *  Each is searched for real on the current data (travis-full-run3-20261025):
 *  - Pflugerville, Round Rock, Austin: places in the vendored gazetteer (travis-places@1.0.0),
 *    asserted by searchSuggest.test.ts.
 *  - 78660: a Travis ZCTA in the same gazetteer (same test).
 *  - 2026-121002 BP: an open Roofing permit read from the live Run 3 index via property.get on
 *    2026-10-25 (tests/e2e/lib/run-fixtures.ts, OPEN_PERMIT_NUMBER).
 *  - 138273: the requestIdentifier (TCAD account) of that same property (LEAD_FIXTURES.openPermit).
 *  - 2725 WOODALL DR 1401, CEDAR PARK, TX 78613: taken from Task A's Run 3.1 evidence (a real
 *    `unnormalized_address`); confirm against the promoted Run 3.1 index when it is live. */
export const SEARCH_SAMPLES: readonly SearchSample[] = [
  { label: "Pflugerville", query: "Pflugerville", verified: "gazetteer place" },
  { label: "78660", query: "78660", verified: "gazetteer ZCTA" },
  { label: "Round Rock", query: "Round Rock", verified: "gazetteer place" },
  { label: "Permit 2026-121002 BP", query: "2026-121002 BP", verified: "Run 3 live index" },
  { label: "TCAD account 138273", query: "138273", verified: "Run 3 live index" },
  {
    label: "2725 WOODALL DR 1401",
    query: "2725 WOODALL DR 1401, CEDAR PARK, TX 78613",
    verified: "Task A Run 3.1 evidence",
  },
];
