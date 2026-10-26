// OUT OF SCOPE FOR B-02 (decided 2026-10-23, superseding the "Phase D" note T040 left below).
//
// This is Task A's own A-03-TC-044 (FR-012, AC-1; Oracle's contracts/storage.md): it proves
// Oracle's *public* CID-copy S3 bucket (SSM parameter `/countylens/cid-copy/bucket`, the
// `assess-cid-writer` identity with no Delete/ACL rights, the bucket policy and conditional
// write that refuse an overwrite) holds byte-identical elephant-cli output and nothing else.
// B-02 (stories/B-02-lead-index.md) has no such bucket: it *reads* Task A's published artifacts
// by CID (CloudFront copy, falling back to Filebase then Pinata per AC-1) and writes its own
// `crm_property`/`crm_permit` Parquet to a *private* bucket. There is no public CID copy of
// B-02's own output for this test's assertions to apply to.
//
// Vendoring `lib/aws.ts` would pull in Oracle's own infra assumptions wholesale: it is written
// entirely around CountyLensCidCopyWriter / `/countylens/cid-copy/bucket`, which B-02 never
// provisions (B-02's architecture note, G3/ARD-01, is DuckDB-over-Parquet in the API Lambda —
// no public gateway surface at all). `lib/needs-aws.ts`'s AWS-availability guard is generic in
// principle, but gating a test that otherwise asserts against infrastructure this story doesn't
// build buys nothing.
import { test } from "@playwright/test";

test("out of scope for B-02", () => {
  test.skip(
    true,
    "A-03 Oracle CID-copy-bucket assertions are out of scope for B-02 — see file header",
  );
});
