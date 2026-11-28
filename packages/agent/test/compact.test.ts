import { expect, test } from "vitest";
import { compactForModel, MODEL_ROW_LIMIT } from "../src/mcp-tools.ts";

const mcp = (value: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
  isError: false,
});
const row = (i: number) => ({
  permit_number: `R-${i}`,
  open_years: 6.1,
  contractor_name: null,
  source_url: "https://gis.example/permit",
  provenance: [{ source_url: "https://gis.example/permit", retrieved_at: "2026-11-27T12:00:00Z" }],
  property_cid: "baguqeeraexample",
  manifest_cid: "bafkreiexample",
});

test("compact: drops provenance, URLs, ids and nulls from rows; keeps the run's manifest once", () => {
  const out = JSON.parse(
    compactForModel(mcp({ manifest_cid: "bafkreiexample", total_matching: 1, rows: [row(1)] })),
  );
  expect(out).toEqual({
    manifest_cid: "bafkreiexample",
    total_matching: 1,
    rows: [{ permit_number: "R-1", open_years: 6.1 }],
  });
});

test("compact: caps the rows the model reads and says how many were returned", () => {
  const rows = Array.from({ length: 174 }, (_, i) => row(i));
  const out = JSON.parse(compactForModel(mcp({ total_matching: 174, count: 174, rows })));
  expect(out.rows).toHaveLength(MODEL_ROW_LIMIT);
  expect(out.total_matching).toBe(174);
  expect(out.rows_note).toMatch(/Showing 40 of the 174 rows/);
  // A large answer shrinks by an order of magnitude.
  expect(compactForModel(mcp({ rows })).length * 5).toBeLessThan(JSON.stringify(mcp({ rows })).length);
});

test("compact: non-JSON text and unknown shapes pass through", () => {
  expect(compactForModel({ content: [{ type: "text", text: "plain" }] })).toBe("plain");
  expect(compactForModel({ x: 1 })).toBe('{"x":1}');
});
