// B-07 T003: lead schema shape checks.
import { describe, expect, it } from "vitest";
import { Lead, LeadEvent, LeadFilters, LeadSignals, LeadStatus } from "../../src/schemas/lead.js";

describe("lead schemas", () => {
  it("accepts exactly the five statuses", () => {
    for (const s of ["new", "contacted", "qualified", "won", "lost"]) {
      expect(LeadStatus.safeParse(s).success).toBe(true);
    }
    expect(LeadStatus.safeParse("closed").success).toBe(false);
  });

  it("parses a Lead and rejects a bad createdFrom", () => {
    const lead = {
      leadId: "01J",
      address: "1 Main St",
      lat: 30.2,
      lon: -97.7,
      status: "new",
      assignee: "rep",
      createdFrom: "map",
      sourceManifestCid: "bafy",
      createdAt: "2026-10-24T00:00:00Z",
      eventSequence: 0,
    };
    expect(Lead.safeParse(lead).success).toBe(true);
    expect(Lead.safeParse({ ...lead, createdFrom: "fax" }).success).toBe(false);
  });

  it("does not cap note length in LeadEvent.change", () => {
    const ev = { sequence: 1, at: "t", by: "rep", change: "x".repeat(5000), kind: "note" };
    expect(LeadEvent.safeParse(ev).success).toBe(true);
  });

  it("accepts empty filters and rejects an unknown permitStatus", () => {
    expect(LeadFilters.safeParse({}).success).toBe(true);
    expect(LeadFilters.safeParse({ permitStatus: "weird" }).success).toBe(false);
  });

  it("accepts signals with or without roofAgeConfidence and rejects a bad value", () => {
    const base = { capturedAt: "2026-10-01T00:00:00Z", roofAgeYears: 20 };
    expect(LeadSignals.safeParse(base).success).toBe(true);
    for (const c of ["high", "medium", "low", "none"]) {
      expect(LeadSignals.parse({ ...base, roofAgeConfidence: c }).roofAgeConfidence).toBe(c);
    }
    expect(LeadSignals.safeParse({ ...base, roofAgeConfidence: "certain" }).success).toBe(false);
  });

  it("accepts an optional openPermitStatus of open or stalled only", () => {
    const base = { capturedAt: "2026-10-01T00:00:00Z" };
    expect(LeadSignals.safeParse(base).success).toBe(true);
    for (const v of ["open", "stalled"]) {
      expect(LeadSignals.parse({ ...base, openPermitStatus: v }).openPermitStatus).toBe(v);
    }
    expect(LeadSignals.safeParse({ ...base, openPermitStatus: "closed" }).success).toBe(false);
  });
});
