// B-07 TC-010: a note is stored as the event text `note: "<JSON string>"`. The page must show the
// rep's own text (quotes, ampersands, line breaks intact), not the storage wrapper or its escapes.
import { describe, expect, it } from "vitest";
import { eventText } from "../../src/routes/Leads/LeadDetail.js";

const event = (kind: string, change: string) => ({ kind, change });

describe("eventText", () => {
  it("unwraps a note and restores its quotes and line breaks", () => {
    const text = `He said "roof is 22 years old" & left\nsecond line`;
    expect(eventText(event("note", `note: ${JSON.stringify(text)}`))).toBe(text);
  });

  it("shows non-note events exactly as stored", () => {
    expect(eventText(event("statusChange", "status: new -> contacted"))).toBe(
      "status: new -> contacted",
    );
  });

  it("falls back to the stored text when a note is not in the expected wrapper", () => {
    expect(eventText(event("note", "note: not json"))).toBe("note: not json");
    expect(eventText(event("note", "something else"))).toBe("something else");
  });
});
