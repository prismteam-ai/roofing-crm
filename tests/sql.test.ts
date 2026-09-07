import { describe, expect, it } from "vitest";
import { assertReadOnlySelect, idLiteral, ilikeTerm, int, num, oneOf } from "@/lib/queries/sql";

describe("num / int / oneOf", () => {
  it("clamps and rounds", () => {
    expect(num(3.14159265, { decimals: 2 })).toBe(3.14);
    expect(num(50, { max: 15 })).toBe(15);
    expect(int("7.9")).toBe(7);
  });
  it("throws on garbage", () => {
    expect(() => num("abc")).toThrow(RangeError);
    expect(() => num(undefined)).toThrow(RangeError);
    expect(() => oneOf("delete", ["a", "b"])).toThrow(RangeError);
  });
});

describe("idLiteral", () => {
  it("quotes valid identifiers", () => {
    expect(idLiteral("15252900U000710000")).toBe("'15252900U000710000'");
    expect(idLiteral("97 2733")).toBe("'97 2733'");
  });
  it("rejects injection attempts", () => {
    expect(() => idLiteral("x' OR 1=1 --")).toThrow(RangeError);
    expect(() => idLiteral("a;b")).toThrow(RangeError);
    expect(() => idLiteral("")).toThrow(RangeError);
  });
});

describe("ilikeTerm", () => {
  it("escapes wildcards and quotes", () => {
    expect(ilikeTerm("O'Brien 100% _roof_")).toBe("'%O''Brien 100\\% \\_roof\\_%' ESCAPE '\\'");
  });
  it("truncates long input", () => {
    expect(ilikeTerm("a".repeat(500)).length).toBeLessThan(120);
  });
});

describe("assertReadOnlySelect", () => {
  it("accepts SELECT and WITH", () => {
    expect(assertReadOnlySelect("  SELECT 1;")).toBe("SELECT 1");
    expect(assertReadOnlySelect("WITH x AS (SELECT 1) SELECT * FROM x")).toContain("WITH");
  });
  it("rejects mutations, multi-statements and comments", () => {
    expect(() => assertReadOnlySelect("DELETE FROM properties")).toThrow();
    expect(() => assertReadOnlySelect("SELECT 1; SELECT 2")).toThrow();
    expect(() => assertReadOnlySelect("SELECT 1 -- x")).toThrow();
    expect(() =>
      assertReadOnlySelect(
        "SELECT * FROM properties WHERE 1=1 UNION SELECT * FROM x; DROP TABLE y",
      ),
    ).toThrow();
    expect(() => assertReadOnlySelect("select 1 into outfile")).not.toThrow(); // DuckDB has no OUTFILE; server also guards
    expect(() => assertReadOnlySelect("COPY properties TO 'x'")).toThrow();
  });
  it("rejects file / network table functions and extension loading", () => {
    expect(() => assertReadOnlySelect("SELECT * FROM read_parquet('s3://x/y.parquet')")).toThrow(
      /table functions/,
    );
    expect(() => assertReadOnlySelect("SELECT * FROM read_csv_auto('/etc/passwd')")).toThrow();
    expect(() => assertReadOnlySelect("SELECT * FROM glob('/**')")).toThrow();
    expect(() => assertReadOnlySelect("INSTALL httpfs")).toThrow();
    expect(() => assertReadOnlySelect("LOAD httpfs")).toThrow();
    expect(() => assertReadOnlySelect("SELECT httpfs FROM x")).toThrow();
    expect(() =>
      assertReadOnlySelect("SELECT count(*) FROM properties WHERE address_city ILIKE '%read%'"),
    ).not.toThrow();
  });
});
