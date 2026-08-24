import { describe, expect, it } from "vitest";
import { LEAD_STATUSES, isLeadStatus } from "./lead-status.js";

describe("LeadStatus", () => {
  it("includes new and archived exactly as documented in the lead lifecycle", () => {
    // Given the CRM lead state machine (new → … → archived)
    // When LeadStatus values are listed
    // Then new and archived are present and the set matches the documented lifecycle only
    expect(LEAD_STATUSES).toContain("new");
    expect(LEAD_STATUSES).toContain("archived");
    expect([...LEAD_STATUSES]).toEqual([
      "new",
      "contacted",
      "qualified",
      "lost",
      "won",
      "archived",
    ]);
  });

  it("narrows known LeadStatus strings and rejects others", () => {
    // Given candidate status strings
    // When isLeadStatus checks them
    // Then documented statuses pass and unknown values fail
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("archived")).toBe(true);
    expect(isLeadStatus("pending")).toBe(false);
  });
});
