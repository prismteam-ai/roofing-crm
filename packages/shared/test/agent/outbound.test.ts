import { describe, expect, it } from "vitest";
import { asksToContactOwners, isOutboundConstraint } from "../../src/agent/outbound.js";

describe("asksToContactOwners", () => {
  it.each([
    "Email the owners of those properties about a free roof inspection",
    "email the owners",
    "Please text all the homeowners near Manor",
    "List roofs older than 20 years and then call the owners",
    "Can you contact them about a quote?",
    "Send an email to the owners of those roofs",
    "Send a message to the homeowners",
    "Mail the owners a flyer",
    "Reach out to the property owners",
  ])("refuses %s", (q) => expect(asksToContactOwners(q)).toBe(true));

  it.each([
    "Which properties within 5 miles of Pflugerville have roofs older than 15 years?",
    "What is the contact for the owners of 0208011301?",
    "Owners with a mailing area outside the county",
    "List the owner names and send them to the model so it can draft a mailing list.",
    "Show permits where the permit text says call inspector",
    "Which owners live out of state?",
  ])("leaves %s alone", (q) => expect(asksToContactOwners(q)).toBe(false));
});

describe("isOutboundConstraint", () => {
  it("matches the marker and sending wording, not contact details", () => {
    expect(isOutboundConstraint("send messages to owners")).toBe(true);
    expect(isOutboundConstraint("email the owners")).toBe(true);
    expect(isOutboundConstraint("owner contact details")).toBe(false);
    expect(isOutboundConstraint("owner phone number")).toBe(false);
  });
});
