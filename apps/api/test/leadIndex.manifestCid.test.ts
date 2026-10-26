// T020 (B-09, US4/AC-7): proves the deployed LeadIndex reads from Task A's Run 2 full-county
// manifest (bafkreihidj...kbcy, runId travis-full-run2-20261024, 441,961 properties / 15,025
// roofing permits — it replaced Run 1, which failed Task A's own identity gate), not the earlier
// 35-row sample. This is an AWS-backed check, not a fake-injected unit test — `leadIndex.ts`'s own
// comment notes every *other* test in this file tree injects a fake LeadIndex and never depends
// on CRM_INDEX_BUCKET_NAME/CRM_LEADS_TABLE_NAME being set; this is the one test that deliberately
// does, the same way tests/agent/golden.test.ts deliberately requires RUNTIME_URL instead of
// faking the agent. It is a local no-op (skipped, not failed) until the real stack is deployed
// and its env vars are present. Promoting Run 2 is a `DATA_MANIFEST_CID` config change + deploy
// (CrmSync's deploy-time sync), not a code change.
import { describe, expect, it } from "vitest";
import { setLeadIndexForTest, tryLeadIndex } from "../src/leadIndex.js";

const RUN_2_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";

const hasDeployedIndexEnv =
  process.env.CRM_INDEX_BUCKET_NAME !== undefined &&
  process.env.CRM_INDEX_BUCKET_NAME !== "" &&
  process.env.CRM_LEADS_TABLE_NAME !== undefined &&
  process.env.CRM_LEADS_TABLE_NAME !== "";

describe.skipIf(!hasDeployedIndexEnv)(
  "LeadIndex reads the Run 2 full-county manifest (deployed only)",
  () => {
    it("indexInfo().manifestCid equals the Run 2 CID, not the 35-row sample", async () => {
      setLeadIndexForTest(undefined); // force tryLeadIndex() to build a real adapter from env
      const leadIndex = tryLeadIndex();
      if (leadIndex === undefined) throw new Error("tryLeadIndex() built no adapter from env");
      const info = await leadIndex.indexInfo();
      expect(info.manifestCid).toBe(RUN_2_MANIFEST_CID);
    });
  },
);

describe.skipIf(hasDeployedIndexEnv)(
  "LeadIndex reads the Run 2 full-county manifest (local run, no deployed env)",
  () => {
    it.todo(
      "skipped locally — set CRM_INDEX_BUCKET_NAME/CRM_LEADS_TABLE_NAME to the deployed stack's " +
        "values to run this for real (Phase Z/TZ05), once the Run 2 manifest is actually promoted",
    );
  },
);
