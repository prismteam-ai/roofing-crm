import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { haversineMiles, propertySchema, rankProperties, type Property } from '@roofing/shared';
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
  const out = all.filter((p) => {
    if (haversineMiles(input.lat, input.lon, p.lat, p.lon) > input.radiusMiles) return false;
    const open = p.permits.filter((x) => x.is_roofing && x.status_is_open);
    const longest = Math.max(0, ...open.map((x) => x.open_days ?? 0));
    const oldEnough =
      input.minRoofAge === undefined || (p.roof_age_years ?? -1) >= input.minRoofAge;
    const openOk =
      open.length > 0 && (input.minOpenDays === undefined || longest >= input.minOpenDays);
    if (input.openRoofingPermitsOnly) return openOk;
    // default: lead candidates = old roof OR qualifying open permit
    return oldEnough || openOk;
  });
  return rankProperties(out).slice(0, input.limit ?? 200);
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
    return { properties: filterProperties(this.data.properties, input), source: this.source };
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
