/**
 * Loads the published Chester demo contractor roster (BBB grades).
 *
 * Source: elephant-pipeline chester-demo.json contractorRosterUrl (CID
 * CHESTER_DEMO_CONTRACTOR_ROSTER_SOURCE_CID). Bundled as a fixture — never
 * fetched from IPFS/Filebase at runtime.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_PATH,
  BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_RELATIVE_PATH,
} from "./chester-demo-contractor-roster-contract.js";

export interface ChesterDemoContractorRosterEntry {
  name: string;
  bbbGrade: string | null;
  bbbScore: number | null;
  complaintCount: number | null;
  provenance: string | null;
}

let cachedRosterByName: Map<string, ChesterDemoContractorRosterEntry> | null = null;
let cachedRosterLoadPromise: Promise<
  Map<string, ChesterDemoContractorRosterEntry>
> | null = null;

const apiSourceDirectoryPath = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves bundled roster JSON for Lambda image or local monorepo checkout.
 */
export function resolveChesterDemoContractorRosterPath(
  rosterPathOverride?: string,
): string {
  if (rosterPathOverride !== undefined && rosterPathOverride.length > 0) {
    return rosterPathOverride;
  }
  if (existsSync(BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_PATH)) {
    return BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_PATH;
  }
  const monorepoPath = path.join(
    apiSourceDirectoryPath,
    "../../../..",
    BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_RELATIVE_PATH,
  );
  if (existsSync(monorepoPath)) {
    return monorepoPath;
  }
  return path.join(
    apiSourceDirectoryPath,
    "../../../../",
    BUNDLED_CHESTER_DEMO_CONTRACTOR_ROSTER_RELATIVE_PATH,
  );
}

function normalizeContractorName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Parses roster JSON into a name → entry map.
 */
export function parseChesterDemoContractorRoster(
  raw: unknown,
): Map<string, ChesterDemoContractorRosterEntry> {
  const map = new Map<string, ChesterDemoContractorRosterEntry>();
  if (!Array.isArray(raw)) {
    return map;
  }
  for (const item of raw) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name.length === 0) {
      continue;
    }
    const entry: ChesterDemoContractorRosterEntry = {
      name,
      bbbGrade: typeof record.bbbGrade === "string" ? record.bbbGrade : null,
      bbbScore:
        typeof record.bbbScore === "number" && Number.isFinite(record.bbbScore)
          ? record.bbbScore
          : null,
      complaintCount:
        typeof record.complaintCount === "number" &&
        Number.isFinite(record.complaintCount)
          ? record.complaintCount
          : null,
      provenance: typeof record.provenance === "string" ? record.provenance : null,
    };
    map.set(normalizeContractorName(name), entry);
  }
  return map;
}

/**
 * Loads and caches the bundled Chester demo contractor roster.
 */
export async function loadChesterDemoContractorRosterByName(arguments_?: {
  rosterPath?: string;
  readRosterJson?: () => Promise<unknown>;
}): Promise<Map<string, ChesterDemoContractorRosterEntry>> {
  if (cachedRosterByName !== null) {
    return cachedRosterByName;
  }
  if (cachedRosterLoadPromise !== null) {
    return cachedRosterLoadPromise;
  }

  cachedRosterLoadPromise = (async () => {
    const raw =
      arguments_?.readRosterJson !== undefined
        ? await arguments_.readRosterJson()
        : JSON.parse(
            await readFile(
              resolveChesterDemoContractorRosterPath(arguments_?.rosterPath),
              "utf8",
            ),
          );
    cachedRosterByName = parseChesterDemoContractorRoster(raw);
    return cachedRosterByName;
  })();

  try {
    return await cachedRosterLoadPromise;
  } catch (error) {
    cachedRosterLoadPromise = null;
    throw error;
  }
}

/**
 * Clears the process-level roster cache (tests only).
 */
export function clearChesterDemoContractorRosterCache(): void {
  cachedRosterByName = null;
  cachedRosterLoadPromise = null;
}

/**
 * Looks up BBB for a contractor name on the demo roster.
 */
export function resolveChesterDemoContractorBbb(
  rosterByName: Map<string, ChesterDemoContractorRosterEntry>,
  contractorName: string | null | undefined,
): { ratingLetter: string | null; ratingScore: number | null } | null {
  if (contractorName === null || contractorName === undefined) {
    return null;
  }
  const entry = rosterByName.get(normalizeContractorName(contractorName));
  if (entry === undefined) {
    return null;
  }
  if (entry.bbbGrade === null && entry.bbbScore === null) {
    return null;
  }
  return {
    ratingLetter: entry.bbbGrade,
    ratingScore: entry.bbbScore,
  };
}
