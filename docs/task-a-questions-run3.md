# Questions for Task A about Run 3 data gaps

Written 2026-10-25 by the CRM side. Source: Run 3 manifest `bafkreifndsdibdllvgpzwmif6getzwvc6rupk5tgeak4eypccaw3t7vlfm` (run `travis-full-run3-20261025`), read from the CID-verified table parts and the CRM index built from them (441,961 properties, 15,025 permits). Every number below was counted from that data.

## A. Fields that are empty for (nearly) every property

1. **Owner mailing address has no ZIP, so owner area is "unknown" for all 441,961 properties.**
   The export holds the mailing-address records (`person_has_mailing_address` 470,597 rows, `company_has_mailing_address` 90,927, `address` 861,958) but `address.postal_code` is never emitted (reason `not_in_export`, 409,152 properties; 237 more have `no_mailing_address`). Can the next run emit `postal_code`, `state_code` and `city_name` on the mailing `address` records? Without them the "owner outside the area" filter and question cannot work. If ADR-0002 forbids it, what is the reason, and is there another way to publish the owner's area (for example a derived `owner_area_class` carried on the property)?

2. **Property (situs) address is missing for all 441,961 properties.**
   `property_has_address` has 441,961 edges, yet `unnormalized_address`, `city_name` and `postal_code` all read `not_in_export`. The CRM shows "Address not published in this run" on every property screen and cannot show a street address on a lead. Can situs address text be published? If not, what identifies a property to a rep in the field?

## B. Contractors and BBB

3. **Only 4,139 of 15,025 permits (28%) have a contractor name.** The other 10,886 read `contractor_unresolved`. Is the name genuinely absent on those permits in the Austin source, or is it lost in the join (`property_improvement_has_contractor` has 4,139 rows)? Please give the split between "source prints no name" and "name present but not linked".
4. **No contractor is verified.** `contractor_resolved` is 0 because the Comptroller registry baseline is not loaded (A-07). When will it be, and will a later run mark contractors `resolved` with an official registry id? How will the CRM tell a printed name from a verified one beyond `contractor_resolution`?
5. **BBB:** `bbb_status` is `blocked` for all 4,139 named contractors and `bbb_rating` is always empty. Is a rating ever going to be published, or is there another permitted source? You noted the `bbb_url` shape is unverified: can you confirm the search link opens a usable results page, or say how it should be built?

## C. Roof age and permits

6. **Roof age is a built year, not a roof date, for 98% of the properties that have one.** Of 389,528 properties with a roof age, 380,018 use basis `built_year` with confidence `low`, and only 9,510 use `permit` with confidence `high`. 52,433 have none (`no_roof_date`). Can the next run carry real roof dates, and is the built-year basis a proxy you intend to keep? A rep reads "roof age 23 years" as a fact, so the CRM labels the basis and confidence; is that the wording you intend?
7. **Permits cover Austin only.** All 15,025 published permits are `jurisdiction = austin`, and only 80 are open and 1,674 stalled. The manifest says published scope is "roofing-classified, decided-status permits only, not all 2,007,514 linked permits". Why are undecided or open roofing permits left out, given that open roofing permits are the lead signal? Which other jurisdictions in Travis County (Pflugerville, Manor, Lakeway, Travis County itself) are planned, and when?
8. **Permits that never reach a property.** Coverage shows 275,830 with no TCAD geoid, 31,824 with no TCAD id, 36,568 with an ambiguous geoid and 29,480 with an unmatched address. What are the rules, and will an improved match recover some of them?

## D. Coverage and scope

9. **Properties:** 452,753 parcels exist, 441,961 are published (real-property "R" accounts only). Are the other 10,792 accounts (P, MH, MN types) intentionally out of scope for good, or could they be added later?
10. **Smaller gaps to explain:** 32,572 properties have no owner record (`no_owner_record`; the manifest notes 15,410 confidential owners redacted under Tax Code 25.025, so are those inside the 32,572?); 21,550 have no dated sale or deed (`no_dated_sale`, so tenure is unknown); 7,945 have no coordinates after the address-point step.

## E. Delivery

11. **Full snapshot or delta?** Run 3 lists every table part (255) and the CRM treats it as a full replacement. Please confirm that future runs will also list everything, or tell us before one lists only changed groups (the CRM does not follow `previousManifestCid` chains yet).
12. **CloudFront returns 403 (not 404)** for files not copied yet. When will the CloudFront copy be complete for Run 3, so the CRM does not depend on the Filebase fallback?
13. **Contract versioning:** columns are now 58 (v1.1) but the folder is still `contract/v1`. Will the next additive change be called v1.2 in the same folder, and will you announce it? The CRM re-vendors from your branch by commit.
14. **A stable link to one property in the Explorer.** Since A-13 the Explorer lives at `/tx/travis/explore`; the old `/explore` answers 404, which broke the CRM's "View lineage in Explorer" link. The Explorer opens a property from `sel` only when that property is among the current search results, so the CRM now sends `at=<lat>,<lon>&r=1&sel=<cid>`. Can you publish a route that opens a property by CID alone (for example `/tx/travis/property/{cid}`) and keep it stable? Also, the Explorer's server search answered "could not run on the server" on the first try and worked on retry (2026-10-26): is a cold start expected?
15. **A finaled permit should not be "stalled".** In Run 3.1, 952 of the 1,674 permits with `status_class` stalled have a `final_date` (and no `open_days`), and 7 of the 80 open permits have one too. Your `status_class_of` derives stalled from a missing status plus an old issue date and ignores the final date, so a permit finaled in 1991 reads stalled. Can `status_class_of` return closed (or a separate class) when a final date exists? The CRM now treats any permit with a final date as finished (live stalled 722, live open 73) and labels it "Finaled {date} (status not in source)".

## Task A's answers (2026-10-26) and what the CRM does with them

| Q | Answer in short | CRM action |
| --- | --- | --- |
| 1, 2 | The export tool drops the address text from the table; Run 3.1 re-exports with a patch: `unnormalized_address`, `owner_mailing_postal_code`, `owner_mailing_state_code` (contract v1.2). The CAR-reader idea was withdrawn. | Wait for Run 3.1; no CAR reader. Situs city and ZIP stay gaps (not parsed). |
| 3, 4 | 4,139 permits print a company; 416 only a person; 10,470 print none (10,436 are pre-2000). Run 3.1 adds 413 (4,552). Nothing is verified. | Show every contractor as printed, unverified. |
| 5 | No BBB rating will be published. Link without `find_type` (PO checked by hand). | Done (`fab427a`, and stripped on screen). |
| 6 | Built year (confidence Low) is a stand-in they keep. | "estimated from year built" shown. |
| 7, 8 | Open (80) and stalled (1,674) permits are published; no other jurisdictions are planned; 1,974 decided roofing permits unlinked. | Demo and docs say permits are Austin only. |
| 9, 10 | R accounts only. 32,572 no-owner properties are 15,410 confidential plus 17,160 unparsed names. | Label: "Owner not published (confidential or name not parsed)". |
| 11, 12, 13 | Every run is a full snapshot. CloudFront now holds all 255 table parts and the manifest. Additive columns stay in contract/v1 (named v1.2). | No chain-following needed. |
| 14 | Open. | Lineage link uses `at`, `r` and `sel` meanwhile. |


## Status on 2026-10-26: Run 3.1 is live

The CRM serves Run 3.1 (`bafkreidbqsav3rsbxqy5fx3li73uskfth254nz5zw34xwac5w3fd4tmbai`, contract v1.2) and was rebuilt with Task A's review changes (fa6771a). Counts read from the served index: 441,961 properties, 15,025 permits (4,552 with a printed contractor name, none verified, BBB `blocked`). Owner area: in county 346,950, regional 7,399, out of area 41,953, unknown 45,659. Situs address text is published for the properties tested; situs city and ZIP read `source_missing`. Questions 1 to 4 are answered by this run; question 14 (a stable property link in the Explorer) is still open.

## Task A's answer to question 15 (2026-10-26)

Confirmed. `status_class_of` takes only (jurisdiction, improvement_status, issue_date), so a null status with an issue date maps to `stalled` whatever the final date; `open_days` already excludes those rows, which is why exactly the 952 have `open_days` null. A permit with an accepted final date is finished. Planned fix: `status_class_of` gains `final_date` and returns `closed` when the status is null and the final date is accepted (no new enum value), so views, the Explore index, the agent, MCP and our vendored views give the same class. Not made yet (Task A's PO decides the timing; a Run 4 demo is being recorded). Until it lands, the CRM rule (live only when there is no final date; the others labelled "Finaled {date} (status not in source)") matches what the fix will produce. Task A will send the commit to vendor when it lands. Question 14 (a per-property route by CID alone) is still open and not built on their side; the Explorer opens a property with `?sel={cid}` inside an area search. Neither answer changes the data of Run 3.1.

## Task A's fix for question 15 has landed (2026-10-26, not adopted in this submission)

Task A confirmed the fix is in their views v1.3 (commit 4324bb4 on `feature/oracle-pipeline`; contract v1 additive): a permit with no status word and an accepted completion date is classed `closed`; a null-status permit with no completion date is also `closed` when a later roofing permit on the same property finished (new missing reason `superseded_by_later_permit`, 17 permits on Run 4); a status word is never overridden. On their Run 4: closed 14,240, stalled 705 (was 1,674), open 80. This submission stays on Run 3.1, which is what the evidence, the golden queries and the tests were measured on, and keeps its own rule (a permit is live only without a final date; the others read "Finaled {date} (status not in source)"). Adopting v1.3 would mean re-vendoring the views, rebuilding the index on Run 4 and re-running the checks; that is a separate decision for after this submission. Counts on Run 3.1 are unchanged: 722 stalled and 73 open remain live in the CRM under its own rule.

