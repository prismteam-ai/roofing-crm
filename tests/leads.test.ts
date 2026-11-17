import { describe, expect, it } from "vitest";
import { createLead, deleteLead, leadIdFor, leadPatchSchema, listLeads, newLeadSchema, updateLead, workspaceSchema } from "../lib/leads";

/**
 * Lead storage rules, run against the in-memory store used when no table is configured.
 * The DynamoDB path uses the same functions and the same keys.
 */
const WS_A = "workspace-aaaaaaaaaaaa";
const WS_B = "workspace-bbbbbbbbbbbb";

const roofLead = newLeadSchema.parse({
  folio: "0101010101010",
  reason: "aging_roof",
  address: "1 MAIN ST",
  city: "MIAMI",
  zip: "33101",
  owner: "ANN OWNER",
  roofYear: 1990,
  roofBasis: "year_built",
  permitNumber: null,
  permitIssued: null,
  permitStatus: null,
  contractor: null,
  contractorLicence: null,
  lat: 25.77,
  lon: -80.19,
  snapshotId: "20261117T151031Z",
  sourceUrl: "https://example.test/county-record",
});

describe("lead identity", () => {
  it("is the property and the reason, so the same roof cannot be saved twice", () => {
    expect(leadIdFor({ folio: "0101010101010", reason: "aging_roof", permitNumber: null })).toBe(
      leadIdFor({ folio: "0101010101010", reason: "aging_roof", permitNumber: null }),
    );
  });
  it("differs between a roof lead and a permit lead on one property", () => {
    expect(leadIdFor({ folio: "0101010101010", reason: "aging_roof", permitNumber: null })).not.toBe(
      leadIdFor({ folio: "0101010101010", reason: "open_permit", permitNumber: "2020012345" }),
    );
  });
});

describe("lead storage", () => {
  it("creates a lead once and reports a repeat as already saved", async () => {
    const first = await createLead(WS_A, roofLead);
    const again = await createLead(WS_A, roofLead);
    expect(first.created).toBe(true);
    expect(first.lead.status).toBe("new");
    expect(again.created).toBe(false);
    expect(again.lead.leadId).toBe(first.lead.leadId);
    expect(await listLeads(WS_A)).toHaveLength(1);
  });

  it("keeps one workspace's leads out of another's", async () => {
    expect(await listLeads(WS_B)).toHaveLength(0);
  });

  it("updates status and notes, and returns nothing for a lead that does not exist", async () => {
    const [lead] = await listLeads(WS_A);
    const updated = await updateLead(WS_A, lead!.leadId, { status: "contacted", notes: "Called the owner." });
    expect(updated).toMatchObject({ status: "contacted", notes: "Called the owner." });
    expect(await updateLead(WS_A, "no-such-lead", { status: "won" })).toBeNull();
    // Another workspace cannot reach it by ID.
    expect(await updateLead(WS_B, lead!.leadId, { status: "lost" })).toBeNull();
  });

  it("removes a lead", async () => {
    const [lead] = await listLeads(WS_A);
    await deleteLead(WS_A, lead!.leadId);
    expect(await listLeads(WS_A)).toHaveLength(0);
  });
});

describe("input rules", () => {
  it("rejects a folio that is not 13 digits and a status that is not in the pipeline", () => {
    expect(newLeadSchema.safeParse({ ...roofLead, folio: "123" }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ status: "maybe" }).success).toBe(false);
  });
  it("rejects a short or malformed workspace ID", () => {
    expect(workspaceSchema.safeParse("short").success).toBe(false);
    expect(workspaceSchema.safeParse(WS_A).success).toBe(true);
  });
});
