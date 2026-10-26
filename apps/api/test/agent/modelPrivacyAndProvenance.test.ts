// Review fixes for the Ask agent: the owner name never reaches the model (ADR-03, amended
// 2026-10-25), the compose DATA keeps contractor resolution apart from the printed name, and a
// citation carries the row's published source link instead of a hard-coded null.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import { runAsk } from "../../src/agent/composeAnswer.js";
import { createAgentDispatch, withoutOwnerName } from "../../src/services/agent/tools.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  PROPERTY_CID_A,
  emptyLeadRepo,
  permit,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const OWNER = "DOE, JANE Q";
const NOT_JSON = "not json";

const ownedProperty = () => property({ ownerName: OWNER, ownerKind: "person" });

function ask(
  question: string,
  texts: readonly string[],
  index: FakeLeadIndex,
  plan: Record<string, unknown>,
) {
  const model = scriptedModel([planText(plan), ...texts]);
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question,
    traceId: "t",
    obs,
  });
  return { run, model };
}

const propertiesPlan = {
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: {},
  slotSources: {},
};
const permitsPlan = { ...propertiesPlan, intent: "find_permits" };

describe("the owner name never reaches the model", () => {
  it("withoutOwnerName nulls the key at any depth and leaves the rest", () => {
    const out = withoutOwnerName({ a: [{ ownerName: OWNER, keep: 1 }], ownerName: OWNER });
    expect(out).toEqual({ a: [{ ownerName: null, keep: 1 }], ownerName: null });
  });

  it("every dispatch output is free of the owner name", async () => {
    const index = new FakeLeadIndex([ownedProperty()], [permit()]);
    const dispatch = createAgentDispatch({
      leadIndex: index,
      leadRepo: emptyLeadRepo(),
      placeResolver: createPlaceResolver(),
    });
    const where = { lat: 30.44, lon: -97.6, radiusMi: 5 };
    const outputs = [
      await dispatch.searchProperties(where),
      await dispatch.searchPermits(where),
      await dispatch.getProperty({ propertyCid: PROPERTY_CID_A }),
      await dispatch.getProperty({ tcadId: "R-0001" }),
      await dispatch.getCoverage(),
      await dispatch.proposeLeads({ tcadIds: ["R-0001"] }),
    ];
    for (const out of outputs) expect(JSON.stringify(out)).not.toContain(OWNER);
  });

  it.each([
    ["properties", propertiesPlan],
    ["permits (the owner property is joined in)", permitsPlan],
  ])("no model prompt of a %s turn contains the owner name", async (_name, plan) => {
    const index = new FakeLeadIndex([ownedProperty()], [permit()]);
    const { run, model } = ask("Roofs near Pflugerville?", [NOT_JSON], index, plan);
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(model.doGenerateCalls.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(model.doGenerateCalls.map((c) => c.prompt))).not.toContain(OWNER);
    expect(JSON.stringify(answer)).not.toContain(OWNER);
  });
});

describe("permit contractor in the compose DATA", () => {
  it("sends contractorResolution and the printed name as separate keys, never `contractor`", async () => {
    const index = new FakeLeadIndex(
      [property()],
      [permit({ contractorResolution: "unresolved", contractorNameAsPrinted: "ACME ROOFING LLC" })],
    );
    const { run, model } = ask("Permits near Pflugerville?", [NOT_JSON], index, permitsPlan);
    await run;
    const compose = model.doGenerateCalls[1];
    const text = JSON.stringify(compose?.prompt);
    expect(text).toContain("contractorResolution");
    expect(text).toContain("contractorNameAsPrinted");
    expect(text).toContain("ACME ROOFING LLC");
    expect(text).not.toMatch(/\\"contractor\\":/);
    expect(JSON.stringify(compose?.prompt)).toContain("not verified");
  });
});

describe("citation provenance", () => {
  it("passes the published source link through and records the row CID", async () => {
    const index = new FakeLeadIndex(
      [property({ sourceUrl: "https://example.test/prop/1" })],
      [permit({ sourceUrl: "https://example.test/permit/1" })],
    );
    const props = await ask("Roofs near Pflugerville?", [NOT_JSON], index, propertiesPlan).run;
    expect(props.citations[0]?.sourceUrl).toBe("https://example.test/prop/1");
    expect(props.citations[0]?.tableCid).toBe(props.citations[0]?.propertyCid);

    const index2 = new FakeLeadIndex(
      [property()],
      [permit({ sourceUrl: "https://example.test/permit/1" })],
    );
    const permits = await ask("Permits near Pflugerville?", [NOT_JSON], index2, permitsPlan).run;
    const cited = permits.citations.find((c) => c.kind === "permit");
    expect(cited?.sourceUrl).toBe("https://example.test/permit/1");
  });

  it("keeps null when the row carries no source link (old rows)", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const answer = await ask("Roofs near Pflugerville?", [NOT_JSON], index, propertiesPlan).run;
    expect(answer.citations[0]?.sourceUrl).toBeNull();
  });
});
