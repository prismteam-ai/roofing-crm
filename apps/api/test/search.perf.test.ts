// Timing, size and memory for the search paths on the REAL Run 2 index (441,961 properties,
// 15,025 permits). Opt-in: needs CRM_PERF=1 and CRM_REAL_INDEX_DIR pointing at a folder with the
// published `crm_property.parquet` and `crm_permit.parquet` (copy them read-only from the index
// bucket); without either, the suite skips. Run:
//   CRM_PERF=1 CRM_REAL_INDEX_DIR=/path/to/real-index pnpm --filter @crm/api exec vitest run test/search.perf.test.ts
// Defect it guards (docs/evidence/B-09.md, GAP-1): a permit search used to list every property in
// the radius and join in JavaScript, so it ran the 1024 MB Lambda out of memory (Pflugerville 5 mi),
// timed out (Austin 5 mi) or answered over 6 MB (Austin 3 mi). NFR (architecture-constitution.md
// section 10): search warm p95 < 500 ms; every response < 1 MB.
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { createObservability } from "@crm/observability";
import { DuckDBInstance } from "@duckdb/node-api";
import { mockClient } from "aws-sdk-client-mock";
import { beforeAll, describe, expect, it } from "vitest";
import { DuckDbParquetLeadIndex } from "../src/adapters/duckDbParquet.js";
import { createLeadService } from "../src/services/leads.js";
import type { LeadRepo, StoredLead } from "../src/adapters/leadRepo.js";
import { countyOverview, searchPermits, searchProperties } from "../src/services/search.js";

const DIR = process.env.CRM_REAL_INDEX_DIR ?? "";
const HAVE_DATA =
  DIR !== "" &&
  existsSync(join(DIR, "crm_property.parquet")) &&
  existsSync(join(DIR, "crm_permit.parquet"));
const MANIFEST = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
const AUSTIN = { lat: 30.2686, lng: -97.7382 };
const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };
const WARM_RUNS = 5;
const BUDGET_MS = 500;
const MAX_BYTES = 1024 * 1024;

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

interface Row {
  label: string;
  coldMs: number;
  warmMaxMs: number;
  warmMedianMs: number;
  bytes: number;
  rows: number;
  peakRssMb: number;
}

/** Peak resident memory while `run` executes (sampled every 5 ms; DuckDB works off-thread). */
async function withPeakRss<T>(run: () => Promise<T>): Promise<{ value: T; peakMb: number }> {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  try {
    const value = await run();
    peak = Math.max(peak, process.memoryUsage().rss);
    return { value, peakMb: peak / 1024 / 1024 };
  } finally {
    clearInterval(timer);
  }
}

describe.skipIf(process.env.CRM_PERF !== "1" || !HAVE_DATA)(
  "search on the real Run 2 index",
  () => {
    let index: DuckDbParquetLeadIndex;
    const report: Row[] = [];

    beforeAll(async () => {
      ddbMock.on(GetCommand).resolves({
        Item: { pk: "META#index", current: MANIFEST, propertyCount: 441_961, permitCount: 15_025 },
      });
      s3Mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => ({
        Body: createReadStream(
          join(
            DIR,
            input.Key?.endsWith("crm_permit.parquet")
              ? "crm_permit.parquet"
              : "crm_property.parquet",
          ),
        ) as unknown as GetObjectCommandOutput["Body"],
      }));
      index = new DuckDbParquetLeadIndex({
        ddb: DynamoDBDocumentClient.from(new DynamoDBClient({})),
        s3: new S3Client({}),
        tableName: "crm-leads",
        bucket: "crm-index",
        obs: createObservability("search-perf"),
        coldLoadTimeoutMs: 120_000,
        tmpDir: join(DIR, "..", "perf-downloads"),
      });
      await index.indexInfo();
      await searchProperties(index, { center: AUSTIN, radiusMi: 0.5, limit: 1 }); // cold load
      // Read straight from the Parquet (listing the whole county through the index is the very
      // thing this suite guards against).
      const reader = await (
        await (await DuckDBInstance.create(":memory:")).connect()
      ).runAndReadAll(
        `SELECT "requestIdentifier" FROM (SELECT "requestIdentifier", row_number() OVER () AS n
           FROM read_parquet('${join(DIR, "crm_property.parquet")}')) WHERE n % 150 = 0`,
      );
      leadIds = (reader.getRowObjectsJS() as unknown as { requestIdentifier: string }[]).map(
        (r) => r.requestIdentifier,
      );
    }, 180_000);

    /** A rep with about 2,900 leads spread over the whole county (every 150th property). */
    let leadIds: string[] = [];
    const leadRows = (): StoredLead[] =>
      leadIds.map((id, n) => ({
        leadKey: `48453:tcad:${id}`,
        leadId: `L${String(n)}`,
        address: "a",
        lat: 1,
        lon: 2,
        status: "new" as const,
        assignee: "rep-1",
        createdFrom: "map" as const,
        sourceManifestCid: MANIFEST,
        createdAt: "2026-10-24T10:00:00.000Z",
        eventSequence: 0,
      }));
    const leadList = async (
      filters: Parameters<ReturnType<typeof createLeadService>["list"]>[0],
    ) => {
      const repo = {
        listByAssignee: async () => leadRows(),
        signalsFor: async () => new Map(),
        latestEvents: async () => new Map(),
      } as unknown as LeadRepo;
      const out = await createLeadService(repo, { leadIndex: index }).list(filters, "rep-1");
      return { rows: out.leads.length, payload: { ...out, traceId: "t" } };
    };

    const cases: [string, () => Promise<{ rows: number; payload: unknown }>][] = [
      [
        "permit number 1981-001776 BP (radius ignored)",
        async () => {
          const r = await searchPermits(index, {
            center: AUSTIN,
            radiusMi: 25,
            permitNumber: "1981-001776 BP",
          });
          return { rows: r.permits.length, payload: { ...r, traceId: "t" } };
        },
      ],
      ...(
        [
          ["Austin", AUSTIN],
          ["Pflugerville", PFLUGERVILLE],
        ] as const
      ).flatMap(([name, center]) =>
        ([3, 5] as const).map(
          (radiusMi): [string, () => Promise<{ rows: number; payload: unknown }>] => [
            `permits ${String(radiusMi)} mi ${name}`,
            async () => {
              const r = await searchPermits(index, { center, radiusMi });
              return { rows: r.permits.length, payload: { ...r, traceId: "t" } };
            },
          ],
        ),
      ),
      [
        "properties 5 mi Austin (limit 100)",
        async () => {
          const r = await searchProperties(index, { center: AUSTIN, radiusMi: 5, limit: 100 });
          return { rows: r.properties.length, payload: { ...r, traceId: "t" } };
        },
      ],
      [
        "properties 5 mi Pflugerville, roof >= 15 (limit 100)",
        async () => {
          const r = await searchProperties(index, {
            center: PFLUGERVILLE,
            radiusMi: 5,
            roofAgeMinYears: 15,
            limit: 100,
          });
          return { rows: r.properties.length, payload: { ...r, traceId: "t" } };
        },
      ],
      [
        "properties 5 mi ZIP 78701 centre, roof >= 15 (limit 100)",
        async () => {
          const r = await searchProperties(index, {
            center: { lat: 30.270569, lng: -97.742589 },
            radiusMi: 5,
            roofAgeMinYears: 15,
            limit: 100,
          });
          return { rows: r.properties.length, payload: { ...r, traceId: "t" } };
        },
      ],
      [
        "leads.list radius 25 mi (whole county)",
        () =>
          leadList({
            filters: { radiusMi: 25, centerLat: AUSTIN.lat, centerLon: AUSTIN.lng },
            limit: 50,
          }),
      ],
      [
        "leads.list 5 mi Austin, roof >= 15, permit open",
        () =>
          leadList({
            filters: {
              radiusMi: 5,
              centerLat: AUSTIN.lat,
              centerLon: AUSTIN.lng,
              roofAgeMinYears: 15,
              permitStatus: "open",
            },
            limit: 50,
          }),
      ],
      [
        "leads.list permit open only (no radius)",
        () => leadList({ filters: { permitStatus: "open" }, limit: 50 }),
      ],
      ...([365, 1825, 3650] as const).map(
        (days): [string, () => Promise<{ rows: number; payload: unknown }>] => [
          `leads.list permitOpenDaysMin ${String(days)} (county-wide, ~2,900 leads)`,
          () => leadList({ filters: { permitOpenDaysMin: days }, limit: 25 }),
        ],
      ),
      [
        "leads.list permitOpenDaysMin 1825 + permit open + 5 mi Austin",
        () =>
          leadList({
            filters: {
              permitOpenDaysMin: 1825,
              permitStatus: "open",
              radiusMi: 5,
              centerLat: AUSTIN.lat,
              centerLon: AUSTIN.lng,
            },
            limit: 25,
          }),
      ],
      [
        // The e2e NF-01 span on the server: leads.create then leads.list (page of 50 where 49
        // leads come from an older manifest, so the presence check hits the 442k-row index), with
        // 25 ms of simulated DynamoDB latency per repo call. Measured in the hosted Lambda: create
        // about 30 ms, list about 45 ms (X-Ray); the rest of the 1.2 to 2.3 s the browser sees is
        // outside the API.
        "leads.create then leads.list (stale-manifest page, 25 ms per DynamoDB call)",
        async () => {
          const wait = () => new Promise((r) => setTimeout(r, 25));
          const stored = leadRows()
            .slice(0, 49)
            .map((l) => ({ ...l, sourceManifestCid: "old-run" }));
          const repo = {
            create: async (lead: StoredLead) => {
              await wait();
              stored.unshift(lead);
              return lead;
            },
            listByAssignee: async () => {
              await wait();
              return stored;
            },
            signalsFor: async () => {
              await wait();
              return new Map();
            },
            latestEvents: async () => new Map(),
          } as unknown as LeadRepo;
          const svc = createLeadService(repo, { leadIndex: index });
          const first = stored[0];
          const id = leadIds[0] ?? "1";
          await svc.create(
            {
              fips: "48453",
              requestIdentifier: `${id}-new`,
              address: "a",
              lat: 30.27,
              lon: -97.74,
              signals: {},
              sourceManifestCid: MANIFEST,
              createdFrom: "map",
            },
            "rep-1",
          );
          stored.splice(stored.length > 50 ? 50 : stored.length);
          const out = await svc.list({ limit: 50 }, "rep-1");
          stored.shift();
          if (first !== undefined) stored.unshift(first);
          return { rows: out.leads.length, payload: { ...out, traceId: "t" } };
        },
      ],
      [
        "county overview zoom 9 + permits",
        async () => {
          const r = await countyOverview(index, { zoom: 9, permits: true });
          return { rows: r.cells.length, payload: { ...r, traceId: "t" } };
        },
      ],
    ];

    for (const [label, run] of cases) {
      it(
        label,
        async () => {
          const t0 = performance.now();
          const cold = await withPeakRss(run);
          const coldMs = performance.now() - t0;
          const warm: number[] = [];
          let bytes = Buffer.byteLength(JSON.stringify(cold.value.payload));
          let peakMb = cold.peakMb;
          for (let i = 0; i < WARM_RUNS; i++) {
            const start = performance.now();
            const again = await withPeakRss(run);
            warm.push(performance.now() - start);
            peakMb = Math.max(peakMb, again.peakMb);
            bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(again.value.payload)));
          }
          warm.sort((a, b) => a - b);
          const row: Row = {
            label,
            coldMs,
            warmMaxMs: warm[warm.length - 1] ?? 0,
            warmMedianMs: warm[Math.floor(warm.length / 2)] ?? 0,
            bytes,
            rows: cold.value.rows,
            peakRssMb: peakMb,
          };
          report.push(row);
          process.stderr.write(
            `PERF | ${label} | rows ${String(row.rows)} | cold ${row.coldMs.toFixed(0)} ms | warm median ${row.warmMedianMs.toFixed(0)} ms, max ${row.warmMaxMs.toFixed(0)} ms | ${(row.bytes / 1024).toFixed(1)} KiB | peak RSS ${row.peakRssMb.toFixed(0)} MB\n`,
          );
          expect(row.warmMaxMs).toBeLessThan(BUDGET_MS);
          expect(row.bytes).toBeLessThan(MAX_BYTES);
        },
        120_000,
      );
    }
  },
);
