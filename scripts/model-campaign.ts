/** Historical diagnostic plan only. The active P5 campaign is p5-model-campaign.ts. */
import { QUALITY_CORPUS } from "../packages/agent/src/quality";
if (process.argv.length > 2)
  throw new Error(
    "The legacy eight-case diagnostic is plan-only and cannot run inference or grant a repair allowance",
  );
console.log(
  JSON.stringify(
    {
      mode: "historical-diagnostic-plan-only",
      activeCommand: "pnpm campaign",
      activeProfile: "p5-original-objective-36-v1",
      legacyCorpus: QUALITY_CORPUS,
      liveInferenceCalls: 0,
      mayGrantCurrentRepair: false,
    },
    null,
    2,
  ),
);
