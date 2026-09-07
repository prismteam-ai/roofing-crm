/**
 * Dataset documentation chunks indexed into `knowledge_chunks` for the assistant's
 * lexical retrieval. Content is derived from the published query-table contracts and
 * the pipeline's documented coverage; it explains meanings and caveats, not facts about
 * individual parcels (those always come from MCP queries).
 *
 * @module agent/knowledge-docs
 */
export interface KnowledgeDoc {
  id: string;
  source: string;
  title: string;
  section: string;
  body: string;
}

const SRC_PROPS = "osceola/packages/shared/src/query-tables.ts#properties";
const SRC_PERMITS = "osceola/packages/shared/src/query-tables.ts#permits";
const SRC_COUNTY = "osceola/packages/shared/src/county.ts";

export const KNOWLEDGE_DOCS: readonly KnowledgeDoc[] = [
  {
    id: "properties-overview",
    source: SRC_PROPS,
    title: "properties view",
    section: "Overview and keys",
    body: "The `properties` view has one row per appraiser folio (STRAP) for Osceola County, FL. `request_identifier` is the 18-character folio and the parcel key used by the CRM; `parcel_identifier` is the normalised parcel number shared with GIS and permit portals (in this run both hold the same value). `property_id` is a stable hash id. Address columns are `address_street`, `address_city`, `address_zip`. Coordinates `latitude`/`longitude` are WGS84 parcel centroids from the county GIS layer; about 99.7% of rows are geocoded (210,141 of 210,853, as of run 2026-09-07T11-47-45Z-incremental; the pipeline republishes new immutable CIDs so counts move over time). Values: `market_value` (just value), `assessed_value`, `land_value`; `avm_value` is always NULL (no AVM source). `property_type` is a coarse class from the DOR use code: residential (~196.6k), commercial (~6.7k), industrial, institutional, government, agricultural, other. `property_usage_type` is the DOR land-use description.",
  },
  {
    id: "roof-age",
    source: SRC_PROPS,
    title: "properties view",
    section: "How roof age is derived",
    body: "`roof_age_years` is the number of years, as of the pipeline run date, since the date named by `roof_age_basis`. `roof_age_basis` is 'roof_permit' when the parcel has at least one roofing permit with an issue or final date (then `last_roof_permit_date` holds the latest such date and roof age counts from it); 'built_year' when no roofing permit is known and the appraiser's actual year built is used as a proxy; 'unknown' when neither exists (then `roof_age_years` is NULL and the property cannot be qualified by roof age). Coverage as of run 2026-09-07T11-47-45Z-incremental: 5,862 parcels use a roof permit, 164,918 use built year, 40,073 are unknown (roof age known for 170,780). A built-year basis over-estimates roof age when a roof was replaced without a permit, and under-estimates nothing; treat it as a proxy and say so. `effective_year` (appraiser effective year) is a renovation proxy but is not used for roof age. The CRM's default threshold is 15 years (`roof_age_years >= 15`).",
  },
  {
    id: "open-roof-permits",
    source: SRC_PROPS,
    title: "properties view",
    section: "Open roofing permit columns",
    body: "`open_roof_permit_count` counts roofing permits on the parcel that have no final, close or CO date and are not voided or expired. `oldest_open_roof_permit_days` is how many days the oldest such permit has been open as of the run date (use >= 1825 for 'open five years or more'). `has_permits`/`permit_count` cover all permit types. `has_bbb_contractor` is true when any permit on the parcel has a BBB-rated contractor. As of run 2026-09-07T11-47-45Z-incremental, 456 parcels have at least one open roofing permit and 13 have one open five years or more; 2,121 parcels have a BBB-rated contractor on some permit. Long-open permits are a stall signal: the roof work was permitted but never inspected/finaled, so the homeowner may have an unfinished or undocumented roof.",
  },
  {
    id: "ownership",
    source: SRC_PROPS,
    title: "properties view",
    section: "Ownership and tenure columns",
    body: "`owner_name` is the primary owner; `owners_text` lists all owners separated by ' | '. `owner_occupied` is a homestead proxy (mailing address equals situs). `owner_mail_city`, `owner_mail_state`, `owner_mail_country` describe the mailing address. `owner_out_of_state` is true when the owner mails outside Florida (34,846 parcels in this run); `owner_out_of_county` when they mail outside Osceola ZIPs. `last_sale_date` (ISO) and `last_sale_price` are the most recent sale; `years_since_sale` is derived from it (61,973 parcels have no sale in 10+ years). Long tenure plus an aged roof is a common 'original roof' signal. No phone or email contact fields exist in the dataset.",
  },
  {
    id: "properties-nulls",
    source: SRC_PROPS,
    title: "properties view",
    section: "Columns that are NULL for Osceola",
    body: "Not available for Osceola in this milestone (always NULL): `exterior_wall_material`, `roof_covering_material`, `avm_value`, `has_sunbiz_tenant`, `has_pa_corp_tenant`, `hoa_flag`, `property_cid`. Do not filter on them; say 'not available for this county'. `source_urls` holds ' | '-separated canonical source URLs (appraiser and GIS) backing each row and should be cited as provenance. `first_seen_run_id`, `last_changed_run_id`, `row_hash` are change-tracking columns.",
  },
  {
    id: "permits-overview",
    source: SRC_PERMITS,
    title: "permits view",
    section: "Overview and status semantics",
    body: "The `permits` view has one row per building permit from two sources (`source_system`): 'osceola_appraiser' (permit feed embedded in the certified roll, covering county and city permits) and 'osceola_accela' (Osceola County Permit Center portal). `permit_number` is as issued; `parcel_identifier` joins to properties. `improvement_type` is the normalised category (Roofing, Screen enclosure, ...); `is_roofing` is true when the type code or description classifies the permit as roofing. `improvement_status` is normalised to open / finaled / expired / voided / unknown. `is_open` is true when there is no final/close/CO date and the permit is not voided or expired; `days_open` counts from the issue (or opened) date to the close date, or to the run date while still open. Dates are ISO strings: `permit_issue_date`, `application_received_date`, `final_inspection_date`, `permit_close_date`, `completion_date`, `expiration_date`, `opened_date`. `issuing_agency` is 'Osceola County', 'City of Kissimmee', 'City of St. Cloud' or NULL. Coverage as of run 2026-09-07T11-47-45Z-incremental: 318,995 permits (317,197 appraiser feed + 1,798 Accela portal, 306 of those open), 16,534 roofing, 635 open roofing, 15 open roofing permits older than five years; 311,156 have coordinates.",
  },
  {
    id: "contractors-bbb",
    source: SRC_PERMITS,
    title: "permits view",
    section: "Contractor identity and BBB matching method",
    body: "`contractor_name` is the contractor or licensed professional as recorded on the permit; `contractor_qualifier` is the individual license holder (the appraiser feed records 'LAST, FIRST - BUSINESS'); `contractor_phone` is a normalised 10-digit phone; `contractor_license` is the state license number when captured; `contractor_id` is the reconciled contractor entity. BBB data comes from a weekly crawl of BBB Serving Central Florida roofing-contractor profiles, which is geo-blocked outside the US and bot-challenged. Ratings are matched to permits by state license number first, then phone, then normalised business name (`bbb_match_method` = 'license' | 'phone' | 'name'). When matched, `bbb_rating` is the letter rating (A+ ... F), `bbb_accredited` the accreditation flag and `bbb_profile_url` the profile link. As of run 2026-09-07T11-47-45Z-incremental, 2,215 permits carry a BBB rating (1,798 of them roofing) across 253 distinct contractor ids: matched by license 1,520 permits / 173 contractors, by normalised name 684 / 76, by phone 11 / 4; rating mix A+ 1,636, A 308, B- 120, A- 88, F 35, D- 12, B+ 10, C 6. Every other permit has NULL BBB columns and must be shown as 'BBB rating: not available' (not matched is not the same as unrated). Contractor names are populated on 42,740 permits; older appraiser-feed permits often have no contractor recorded.",
  },
  {
    id: "permits-provenance",
    source: SRC_PERMITS,
    title: "permits view",
    section: "Provenance columns",
    body: "`source_url` is the canonical source URL for the permit (Accela detail page or the appraiser export) and should be cited with every permit the assistant reports. `fetched_at` is when the record was captured. `latitude`/`longitude` and `address_street`/`address_city`/`address_zip` are copied from the matched parcel so a single permits query can filter by radius. Permits that could not be matched to a parcel have NULL `property_id` and NULL coordinates and therefore never appear in radius searches.",
  },
  {
    id: "county-places",
    source: SRC_COUNTY,
    title: "Osceola County configuration",
    section: "Places, thresholds and sources",
    body: "Osceola County, FL (FIPS 12097) is the default and only county served. Demo anchor places for radius questions: Kissimmee (28.2919, -81.4076), St. Cloud (28.2489, -81.2812), Celebration (28.3253, -81.5331), Poinciana (28.1403, -81.4587), Harmony (28.1922, -81.1503). Default thresholds: roof age 15 years, long-open permit 5 years, ownership tenure 10 years. Sources: Osceola County Property Appraiser certified roll (annual export, no coordinates), Osceola GIS Parcels layer (weekly, centroids), Osceola Permit Center Accela portal (continuous; unincorporated county only - Kissimmee and St. Cloud issue their own permits, which appear via the appraiser feed), BBB Serving Central Florida roofing profiles (weekly crawl). Radius searches use the haversine formula in miles with Earth radius 3958.8.",
  },
  {
    id: "query-rules",
    source: "elephant-mcp",
    title: "Elephant MCP query rules",
    section: "How to query",
    body: "Data is read only through the Elephant MCP tools. `queryProperties` and `queryPermits` accept exactly one read-only SELECT (or WITH ... SELECT) over the `properties` or `permits` view; mutations and multiple statements are rejected. A row cap applies (default 100, max 1000), so aggregate with count()/group by rather than paging. Use ILIKE '%term%' for owner, city and contractor text. Distances: 3958.8*2*asin(sqrt(pow(sin(radians(latitude-LAT)/2),2)+cos(radians(LAT))*cos(radians(latitude))*pow(sin(radians(longitude-LNG)/2),2))) <= MILES. BIGINT counts are returned as strings. Always call the schema tool before the first query in a session and cite `source_urls` / `source_url` for every row you present.",
  },
];
