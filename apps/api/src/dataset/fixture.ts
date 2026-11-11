import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CONFIDENCE_RANK, haversineMiles, propertySchema, type Property } from '@roofing/shared';
import {
  findPropertiesInput,
  getDatasetInfoOutput,
  type DatasetClient,
  type FindPropertiesInput,
} from './client.js';

export const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/dataset',
);

export function loadFixture(dir = FIXTURE_DIR): {
  properties: Property[];
  info: z.infer<typeof getDatasetInfoOutput>;
} {
  const properties = z
    .array(propertySchema)
    .parse(JSON.parse(readFileSync(join(dir, 'properties.json'), 'utf8')));
  const info = getDatasetInfoOutput.parse(JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8')));
  return { properties, info };
}

/** Pure filter shared by the fixture client and tests. */
export function filterProperties(all: Property[], raw: FindPropertiesInput): Property[] {
  const input = findPropertiesInput.parse(raw);
  const today = new Date().toISOString().slice(0, 10);
  const validAnchor = (p: Property) =>
    p.roof_age_anchor_date == null ||
    (p.roof_age_anchor_date.slice(0, 10) >= '1900-01-01' &&
      p.roof_age_anchor_date.slice(0, 10) <= today);
  const out = all.filter((p) => {
    if (haversineMiles(input.lat, input.lon, p.lat, p.lon) > input.radiusMiles) return false;
    const open = p.permits.filter((x) => x.is_roofing && x.status_is_open);
    const longest = Math.max(
      -Infinity,
      ...open.filter((x) => x.open_days !== null).map((x) => x.open_days!),
    );
    const oldEnough =
      input.minRoofAge === undefined ||
      ((p.roof_age_years ?? -1) >= input.minRoofAge && validAnchor(p));
    const openOk =
      Number.isFinite(longest) && (input.minOpenDays === undefined || longest >= input.minOpenDays);
    if (
      input.minConfidence &&
      input.minConfidence !== 'low' &&
      (p.roof_age_confidence === null ||
        CONFIDENCE_RANK[p.roof_age_confidence] < CONFIDENCE_RANK[input.minConfidence])
    )
      return false;
    return oldEnough && (!input.openRoofingPermitsOnly || openOk);
  });
  const sort = input.sort ?? (input.openRoofingPermitsOnly ? 'open_days' : 'distance');
  const distance = (p: Property) => haversineMiles(input.lat, input.lon, p.lat, p.lon);
  const openDays = (p: Property) =>
    Math.max(
      -1,
      ...p.permits
        .filter(
          (x) =>
            x.is_roofing &&
            x.status_is_open &&
            (input.minOpenDays === undefined || (x.open_days ?? -1) >= input.minOpenDays),
        )
        .map((x) => x.open_days ?? -1),
    );
  return out
    .sort(
      (a, b) =>
        (sort === 'roof_age'
          ? (validAnchor(b) ? (b.roof_age_years ?? -1) : -1) -
            (validAnchor(a) ? (a.roof_age_years ?? -1) : -1)
          : sort === 'open_days'
            ? openDays(b) - openDays(a)
            : 0) ||
        distance(a) - distance(b) ||
        a.pin14.localeCompare(b.pin14),
    )
    .slice(0, input.limit ?? 200);
}

export class FixtureDatasetClient implements DatasetClient {
  readonly kind = 'fixture' as const;
  private readonly data;
  constructor(dir = FIXTURE_DIR) {
    this.data = loadFixture(dir);
  }
  private get source() {
    return {
      runId: this.data.info.runId,
      rootCid: this.data.info.rootCid,
      syncedAt: this.data.info.syncedAt ?? null,
    };
  }
  async findProperties(input: FindPropertiesInput) {
    // Same predicates and count-before-limit semantics as the pipeline MCP.
    const total_in_radius = filterProperties(this.data.properties, {
      ...input,
      limit: this.data.properties.length,
    }).length;
    return {
      properties: filterProperties(this.data.properties, input),
      total_in_radius,
      source: this.source,
    };
  }
  async getProperty(pin14: string) {
    return {
      property: this.data.properties.find((p) => p.pin14 === pin14) ?? null,
      source: this.source,
    };
  }
  async queryDataset(_sql: string, _limit?: number) {
    // ponytail: fixture is JSON, not DuckDB; SQL only works against the pipeline MCP.
    return { columns: [], rows: [], truncated: false };
  }
  async getDatasetInfo() {
    return { ...this.data.info, client: 'fixture' as const };
  }
}
