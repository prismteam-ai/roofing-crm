import { describe, expect, it } from "vitest";

import {
  planRoofingOpportunityQuery,
  queryPlanToRetrievalFilters,
} from "./plan-roofing-opportunity-query.js";

const fortMyersCenter = { lat: 26.6406, lng: -81.8723 };

describe("planRoofingOpportunityQuery", () => {
  it("parses open roofing permits older than five years with mandatory radius search", () => {
    const plan = planRoofingOpportunityQuery({
      message:
        "Which properties near Fort Myers have open roofing permits older than five years?",
      center: fortMyersCenter,
      radiusMiles: 5,
    });

    expect(plan.intent).toBe("open_permits");
    expect(plan.requiresRadiusSearch).toBe(true);
    expect(plan.hasOpenRoofingPermit).toBe(true);
    expect(plan.minOpenPermitYears).toBe(5);
    expect(plan.missingMapContext).toBe(false);
  });

  it("parses structures built before 2011 as aging-roof intent", () => {
    const plan = planRoofingOpportunityQuery({
      message: "Show me structures built before 2011 within five miles of Fort Myers.",
      center: fortMyersCenter,
      radiusMiles: 5,
    });

    expect(plan.intent).toBe("aging_roofs");
    expect(plan.maxBuiltYear).toBe(2011);
    expect(plan.requiresRadiusSearch).toBe(true);
  });

  it("flags missing map context for structured geo questions", () => {
    const plan = planRoofingOpportunityQuery({
      message: "Show open roofing permits older than five years within five miles.",
    });

    expect(plan.missingMapContext).toBe(true);
    expect(plan.requiresRadiusSearch).toBe(false);
  });

  it("detects Chester geography mentions", () => {
    const plan = planRoofingOpportunityQuery({
      message: "Which roofs in West Chester have open permits?",
      center: fortMyersCenter,
      radiusMiles: 5,
    });

    expect(plan.mentionsChesterGeography).toBe(true);
  });

  it("maps aging intent to built_year cutoff filters", () => {
    const plan = planRoofingOpportunityQuery({
      message: "Roofs older than 15 years near this pin",
      center: fortMyersCenter,
      radiusMiles: 3,
    });

    const filters = queryPlanToRetrievalFilters(plan, {
      county: "lee",
      center: fortMyersCenter,
      radiusMiles: 3,
    });

    expect(filters.minBuiltYear).toBe(new Date().getUTCFullYear() - 15);
  });
});
