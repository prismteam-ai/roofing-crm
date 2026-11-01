/** Standalone browser CI test double; paired integration and real hosted tests remain separate gates. */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  CONTRACT_VERSION,
  QuerySchema,
  PropertySchema,
  SearchResponseSchema,
} from "../packages/contracts/src/index";
import {
  distanceMeters,
  propertyMatchesQuery,
  compareQueryRows,
} from "../packages/contracts/src/query-predicates";
import { resolveQueryPlace } from "../packages/places/src/index";
import {
  syntheticProperties,
  SNAPSHOT_ID,
} from "../tests/support/prepared-oracle-fixture";
if (
  process.env.PRISM_TEST_FIXTURE !== "synthetic" ||
  process.env.PRISM_DATA_MODE === "real" ||
  process.env.PRISM_TEST_MODE === "real" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
)
  throw new Error(
    "Synthetic contract fixture requires explicit local-only mode and cannot serve real-data tests",
  );
const rows = syntheticProperties().map((row) => PropertySchema.parse(row));
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:4310");
    let result: unknown;
    if (url.pathname === "/api/health" && request.method === "GET") {
      result = {
        snapshotId: SNAPSHOT_ID,
        contractVersion: CONTRACT_VERSION,
        mode: "synthetic",
        dataMode: "synthetic",
        count: rows.length,
        digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
        region: "us-east-2",
        stage: "local",
        testDouble: "prepared-synthetic-contract-fixture",
      };
    } else if (url.pathname === "/api/search" && request.method === "POST") {
      let body = "";
      for await (const part of request) {
        body += String(part);
        if (Buffer.byteLength(body) > 64000)
          throw new Error("Fixture body bound");
      }
      const query = QuerySchema.parse(JSON.parse(body));
      if (query.snapshotId !== SNAPSHOT_ID || query.cursor)
        throw new Error("Fixture snapshot/cursor bound");
      const matched = rows
        .filter((row) => propertyMatchesQuery(row, query))
        .map((row) => ({
          ...row,
          distanceMeters: distanceMeters(
            query.lat,
            query.lng,
            row.coordinates!.lat,
            row.coordinates!.lng,
          ),
        }))
        .sort((a, b) => compareQueryRows(a, b, query));
      const selected = matched.slice(0, query.limit);
      const place = resolveQueryPlace(query);
      result = SearchResponseSchema.parse({
        contractVersion: CONTRACT_VERSION,
        snapshotId: SNAPSHOT_ID,
        queryHash: createHash("sha256")
          .update(JSON.stringify(query))
          .digest("hex"),
        rows: selected,
        total: matched.length,
        truncated: matched.length > selected.length,
        nextCursor: null,
        limitations: [
          "Prepared synthetic contract fixture only; this is not a real Oracle integration or source coverage proof",
        ],
        ...(place ? { placeResolution: place } : {}),
      });
    } else if (
      url.pathname.startsWith("/api/properties/") &&
      request.method === "GET"
    ) {
      if (url.searchParams.get("snapshotId") !== SNAPSHOT_ID)
        throw new Error("Fixture snapshot mismatch");
      const id = decodeURIComponent(
        url.pathname.slice("/api/properties/".length),
      );
      result = rows.find((row) => row.id === id);
      if (!result) throw new Error("Fixture row unavailable");
    } else {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          code: "INVALID_INPUT",
          message: "Synthetic fixture route unavailable",
        }),
      );
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(result));
  } catch {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        code: "INVALID_INPUT",
        message: "Synthetic contract fixture rejected request",
      }),
    );
  }
});
server.listen(4310, "127.0.0.1", () =>
  process.stdout.write(
    "Prepared synthetic Oracle contract fixture on loopback\n",
  ),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
