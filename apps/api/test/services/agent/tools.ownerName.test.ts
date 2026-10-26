// ADR-03 (amended 2026-10-25): the owner name is shown on the property screen but never reaches
// the model. The agent's getProperty tool result is what the model sees.
import { describe, expect, it } from "vitest";
import type { LeadIndex } from "../../../src/adapters/duckDbParquet.js";
import { createAgentDispatch } from "../../../src/services/agent/tools.js";

describe("agent getProperty tool and the owner name", () => {
  it("returns the property with ownerName blanked, so the model never sees a name", async () => {
    const stored = {
      propertyCid: "p1",
      requestIdentifier: "1000059",
      latitude: 30.2,
      longitude: -97.7,
      ownerName: "DOE, JANE",
      ownerKind: "person",
      missingReasons: [],
      permits: [],
    };
    const leadIndex = {
      indexInfo: () =>
        Promise.resolve({ manifestCid: "m", propertyCount: 1, permitCount: 0, promotedAt: "" }),
      getProperty: () => Promise.resolve(stored),
      getPropertyByRequestIdentifier: () => Promise.resolve(stored),
    } as unknown as LeadIndex;
    const dispatch = createAgentDispatch({
      leadIndex,
      leadRepo: {} as never,
      placeResolver: {} as never,
    });

    const out = await dispatch.getProperty({ propertyCid: "p1" });

    expect(out.found).toBe(true);
    expect(JSON.stringify(out)).not.toContain("DOE, JANE");
    if (out.found) expect(out.property.ownerKind).toBe("person");
  });
});
