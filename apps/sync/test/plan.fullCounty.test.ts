// B-09: Plan against full-county Task A manifests (Run 1 / Run 2 shape). Their shape differs from
// the pilot/sample manifests in four ways this test pins, each found against Run 1's real manifest:
// 1. no `travis-places` profile (places/business out of scope for that run) — query-core 1ef8bff's
//    bindManifest accepts that, so Plan's digest guard must too (a *present* places profile whose
//    digest disagrees still holds);
// 2. ~2.3 GB of `car`/`directory` artifacts next to ~556 MB of tables — the sync only ever fetches
//    `kind: "table"`, so the cost gate must size from those, not from bytes it never downloads;
// 3. no `coverage.parcels_published` — carried as null (never a defaulted 0);
// 4. `coverage.permits_emitted` — carried forward for Validate's permit reconcile.
import { readFileSync } from "node:fs";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boundPartNames, rawCid } from "@crm/oracle-views";
import { planHandler, type PlanResult } from "../handlers/plan.js";

interface Manifest {
  profiles: { name: string; sha256: string }[];
  coverage: Record<string, { count: number }>;
  artifacts: { kind: string; name: string; size: number; cid: string; sha256: string }[];
}

const PILOT = JSON.parse(
  readFileSync(new URL("../../../contract/v1/pilot-manifest.json", import.meta.url), "utf8"),
) as Manifest;

const s3Mock = mockClient(S3Client);

/** Serves `manifest` from every gateway URL and returns the CID its bytes hash to. */
async function serve(manifest: Manifest): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const cid = await rawCid(bytes);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes, { status: 200 })),
  );
  return cid;
}

function fullCountyShape(): Manifest {
  const m = structuredClone(PILOT);
  m.profiles = m.profiles.filter((p) => p.name !== "travis-places");
  delete m.coverage.parcels_published;
  m.coverage.permits_emitted = { ...m.coverage.permits_emitted, count: 17_387 };
  // Run 1's real totals: ~556 MB of tables, ~2.28 GB of CAR files the sync never fetches.
  const cars = m.artifacts.filter((a) => a.kind === "car").length;
  m.artifacts = m.artifacts.map((a) =>
    a.kind === "table"
      ? { ...a, size: 2_700_000 }
      : a.kind === "car"
        ? { ...a, size: Math.ceil(2_280_519_263 / cars) }
        : a,
  );
  return m;
}

describe("Plan: full-county manifest shape (B-09)", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(GetObjectCommand).rejects(new Error("NoSuchKey"));
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRM_INDEX_BUCKET_NAME;
  });

  it("plans (does not hold) a manifest with no travis-places profile", async () => {
    const cid = await serve(fullCountyShape());
    const result = await planHandler({ manifestCidHint: cid });
    expect(result.status).toBeUndefined();
    expect((result as PlanResult).parts.length).toBeGreaterThan(0);
  });

  it("still holds on digest_mismatch when a travis-places profile is present but disagrees", async () => {
    const m = fullCountyShape();
    const places = PILOT.profiles.find((p) => p.name === "travis-places");
    if (places === undefined) throw new Error("pilot manifest has no travis-places profile");
    m.profiles.push({ ...places, sha256: "0".repeat(64) });
    const cid = await serve(m);
    const result = await planHandler({ manifestCidHint: cid });
    expect(result).toMatchObject({ status: "Held", heldReason: "digest_mismatch" });
  });

  it("sizes the cost gate from the table parts it fetches, not the CAR files it never downloads", async () => {
    const m = fullCountyShape();
    const total = m.artifacts.reduce((s, a) => s + a.size, 0);
    const tables = m.artifacts.filter((a) => a.kind === "table").reduce((s, a) => s + a.size, 0);
    expect(total).toBeGreaterThan(2 * 1024 ** 3); // would have tripped the 2 GB gate
    const cid = await serve(m);
    const result = (await planHandler({ manifestCidHint: cid })) as PlanResult;
    expect(result.status).toBeUndefined();
    // Never more than the table parts (and, with the view-scoped list below, often fewer).
    expect(result.costEstimate.predictedBytes).toBeLessThanOrEqual(tables);
  });

  it("carries parcels_published as null when Task A does not publish it, and permits_emitted forward", async () => {
    const cid = await serve(fullCountyShape());
    const result = (await planHandler({ manifestCidHint: cid })) as PlanResult;
    expect(result.coverageParcelsPublished).toBeNull();
    expect(result.coveragePermitsEmitted).toBe(17_387);
  });

  // --- B-09: fetch only the parts the two views BuildIndex reads (query-core 502bfe6) ---

  const VIEWS = ["v_property", "v_roofing_permit"] as const;

  /** The pilot's `tables/<group>/<table>/<part>` names rewritten into Run 1's batched layout:
   *  county tables split over two batches, permit tables in a third. */
  function batched(): Manifest {
    const m = fullCountyShape();
    let county = 0;
    m.artifacts = m.artifacts.flatMap((a) => {
      if (a.kind !== "table") return [a];
      const [, group, table, part] = a.name.split("/");
      if (group === "county") {
        county += 1;
        const batch = county % 2 === 0 ? "b02" : "b01";
        return [{ ...a, name: `run/county-batched/tables/${batch}/${table}/${part}` }];
      }
      return [{ ...a, name: `run/permits-batched/tables/b01/${table}/${part}` }];
    });
    return m;
  }

  it.each([
    ["the pilot layout", fullCountyShape],
    ["Run 1's batched layout", batched],
  ])(
    "lists only the table parts v_property/v_roofing_permit read, for %s",
    async (_label, make) => {
      const m = make();
      const expected = boundPartNames(m.artifacts, VIEWS);
      const allTables = m.artifacts.filter((a) => a.kind === "table");
      expect(expected.length).toBeGreaterThan(0);
      expect(expected.length).toBeLessThan(allTables.length);
      const cid = await serve(m);

      const result = (await planHandler({ manifestCidHint: cid })) as PlanResult;

      expect(result.parts.map((p) => p.path).sort()).toEqual([...expected].sort());
      // Each listed part keeps the CID and SHA-256 from the CID-verified manifest, for FetchPart.
      for (const part of result.parts) {
        const artifact = m.artifacts.find((a) => a.name === part.path);
        expect(part).toMatchObject({ cid: artifact?.cid, sha256: artifact?.sha256 });
      }
    },
  );

  it("sizes the cost gate from exactly the parts it lists (one source with FetchPart and BuildIndex)", async () => {
    const m = batched();
    const cid = await serve(m);
    const result = (await planHandler({ manifestCidHint: cid })) as PlanResult;
    const listed = new Set(result.parts.map((p) => p.path));
    const listedBytes = m.artifacts
      .filter((a) => listed.has(a.name))
      .reduce((sum, a) => sum + a.size, 0);
    const allTableBytes = m.artifacts
      .filter((a) => a.kind === "table")
      .reduce((sum, a) => sum + a.size, 0);
    expect(result.costEstimate.predictedBytes).toBe(listedBytes);
    expect(listedBytes).toBeLessThan(allTableBytes);
  });
});
