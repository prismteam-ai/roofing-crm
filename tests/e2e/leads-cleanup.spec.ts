// B-09 follow-up: the B-07 leads cleanup reads its region from AWS_REGION (CI sets it from
// `vars.AWS_REGION`); it is never hard-coded (constitution: region from config). Pure checks of
// tests/e2e/lib/leads-cleanup.ts: no browser, no AWS call (constructing an SDK client sends no
// request). Milliseconds per viewport project, so it simply runs in each.
import { expect, test } from "@playwright/test";
import { createLeadsCleanup, leadsRegion } from "./lib/leads-cleanup.js";

const LEAD_KEY = "48453:tcad:B07STALE";

test.describe("leads cleanup region", () => {
  test("reads the region from AWS_REGION", () => {
    expect(leadsRegion({ AWS_REGION: "eu-north-1" })).toBe("eu-north-1");
    expect(leadsRegion({ AWS_REGION: " us-east-2 " })).toBe("us-east-2");
  });

  test("fails clearly when AWS_REGION is unset or empty", () => {
    for (const env of [{}, { AWS_REGION: "" }, { AWS_REGION: "   " }]) {
      expect(() => leadsRegion(env)).toThrow(/leads cleanup: AWS_REGION is not set/);
    }
  });

  test("refuses a value that is not an AWS region name", () => {
    expect(() => leadsRegion({ AWS_REGION: "eu north 1" })).toThrow(
      /leads cleanup: AWS_REGION "eu north 1" is not an AWS region name/,
    );
  });

  test("createLeadsCleanup needs the region only once the allow-list is valid", () => {
    // The allow-list checks still run first and unchanged: a bad key is refused whatever the env.
    expect(() => createLeadsCleanup(["not-a-lead-key"], {})).toThrow(/is not a lead key/);
    expect(() => createLeadsCleanup([], {})).toThrow(/allow-list must hold 1 to 4 lead keys/);
    expect(() => createLeadsCleanup([LEAD_KEY], {})).toThrow(/AWS_REGION is not set/);
    const cleanup = createLeadsCleanup([LEAD_KEY], { AWS_REGION: "eu-north-1" });
    expect(cleanup.allowed).toEqual([LEAD_KEY]);
  });

  test("deleteLeads still refuses a key outside the allow-list before any request", async () => {
    const cleanup = createLeadsCleanup([LEAD_KEY], { AWS_REGION: "eu-north-1" });
    await expect(cleanup.deleteLeads(["48453:tcad:SOMEONEELSE"])).rejects.toThrow(
      /refused: "48453:tcad:SOMEONEELSE" is not in the allow-list/,
    );
  });
});
