/**
 * Elephant MCP server environment for Lambda stdio transport.
 *
 * Mirrors the bundled soofi-xyz kit `elephant` MCP config (query tables + IPNS maps)
 * and merges published Chester (real) + Chester (demo) immutable CIDs from
 * elephant-pipeline. Do not overwrite the map — missing keys un-serve those
 * counties. Do not add OPENAI_API_KEY with an empty value — elephant-mcp crashes
 * on startup.
 *
 * `listPublishedCounties` still reads Oracle's catalog. This API overlays Chester
 * keys onto counties.list / defaultCounty from PROPERTY_QUERY_TABLE_MAP so the
 * hosted CRM can default to chester-demo without forging the catalog tool.
 *
 * Demo tables are only ever served under `chester-demo`. Never serve demo Parquet
 * under unsuffixed `chester`. Demo publishes no open-data or coverage artifacts.
 */

/** Immutable Chester (real) query table from elephant-pipeline handoff. */
export const CHESTER_REAL_QUERY_TABLE_URL =
  "https://ipfs.filebase.io/ipfs/QmaKW8eKR3kHPaB1FXTvof8eXoiujx5gaJHCzSeC62fAjB";

/** Immutable Chester (real) permit table (2,630 rows) from elephant-pipeline handoff. */
export const CHESTER_REAL_PERMIT_TABLE_URL =
  "https://ipfs.filebase.io/ipfs/QmTqH6JYjQEMbGPCxrR4YiVE9cK1Ewa7jZHH8yoGnJT8Xu";

/** Immutable Chester (demo) query table from chester-demo.json. */
export const CHESTER_DEMO_QUERY_TABLE_URL =
  "https://ipfs.filebase.io/ipfs/QmY6FuumFtHJQoMCnBPDTSthQtCbt4d3EuiVZ6ZNnDy448";

/** Immutable Chester (demo) permit table from chester-demo.json. */
export const CHESTER_DEMO_PERMIT_TABLE_URL =
  "https://ipfs.filebase.io/ipfs/QmPHfCkeedrsmEEaNLPtDEPPTw2kxprojXjJTybSrr4RoY";

/** Immutable Chester (demo) contractor roster JSON from chester-demo.json. */
export const CHESTER_DEMO_CONTRACTOR_ROSTER_URL =
  "https://ipfs.filebase.io/ipfs/QmQCY8fnQgAwwtdofHe9TKgesLfpqMWuRpVQumZ2ru6NMC";

/** Immutable Chester (demo) RAG corpus JSONL from chester-demo.json. */
export const CHESTER_DEMO_RAG_CORPUS_URL =
  "https://ipfs.filebase.io/ipfs/QmY9SdpRj2pHxSMJNCTRzWfbMPe37hikpevT8qHeEnQ7Yp";

/** Chester (real) geo index — reused by chester-demo (same geography). */
export const CHESTER_GEO_INDEX_IPNS =
  "k51qzi5uqu5dieb81sxl1wzmkv87rd86xyc25c4ndrm3kt31f5ylu4u2893ju5";

/** IPNS/query-table env passed to the stdio MCP child process. */
export const ELEPHANT_MCP_SERVER_ENV: Record<string, string> = {
  PROPERTY_QUERY_TABLE_MAP: JSON.stringify({
    lee: "https://ipfs.filebase.io/ipns/k51qzi5uqu5djd4ohcf3qm87dhlt0e270xw8ejhkyia62edr76uj0u05hrf7m5",
    "palm-beach":
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dlu7hx158su5palzzxdbl6zcm8ojh7645bxisxs0cf0s158h6h3",
    "miami-dade":
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dgqktver4htb060qxfnaytjhybcxlfkp22vtgygbx2lb4t1h1xs",
    orange:
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dhgte20ho86rzg5b7h0ght3a2js5wz0t55i96aaf1d12wpl8efn",
    "santa-clara":
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dgnc94h8ce98ds0cb5yoidmcebpwnvccug4upasgbzpyz3ffgs5",
    chester: CHESTER_REAL_QUERY_TABLE_URL,
    "chester-demo": CHESTER_DEMO_QUERY_TABLE_URL,
    montgomery:
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5didhiyj6zgu691d5bfbz5ard4bvor4t0x7rxca1mtw66gcc7kgu",
  }),
  ORACLE_OPEN_DATA_IPNS_MAP: JSON.stringify({
    lee: "k51qzi5uqu5dlzgslzedrnk4whtd7ip69l0pmd3zxelz8hwjorbeyy0pyyeu4m",
    "palm-beach": "k51qzi5uqu5dgjnt84x8vnj2c9uwxomkpykwdvmf6xg43wwcxsifo6w1sp1wwh",
    "miami-dade": "k51qzi5uqu5dk9i59xxm579a5bziprxpygv8wyi01n2ivd5kj9h5u90g1tzn1d",
    orange: "k51qzi5uqu5dm1g8re6sb3kv9yfh1xtcuohwhrvuklp7ky6l5gj62yrf1potyz",
    chester: "k51qzi5uqu5dkufqw7vyai70ir7cj5fi1lrr8tmim2411p8hajjumot9qwnb98",
    montgomery: "k51qzi5uqu5dhaf7n37odyrqiaqa39170nbqc9qh8fjr0weifpif22na06hgcu",
  }),
  ORACLE_GEO_INDEX_IPNS:
    "k51qzi5uqu5djo3756w73x3swtt63g9y7igj7tvv1gs4skjk3haj3fuk7qosdi",
  ORACLE_GEO_INDEX_IPNS_MAP: JSON.stringify({
    lee: "k51qzi5uqu5djo3756w73x3swtt63g9y7igj7tvv1gs4skjk3haj3fuk7qosdi",
    chester: CHESTER_GEO_INDEX_IPNS,
    "chester-demo": CHESTER_GEO_INDEX_IPNS,
    montgomery: "k51qzi5uqu5diunnmgdou88y7zlba1in0lpk5i7834xnbh2fjq5j9ftqv7dtew",
  }),
  PERMIT_QUERY_TABLE_MAP: JSON.stringify({
    "santa-clara":
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dm5dkii3wz7hj8vqurb1b773uy0qj9nlvsvgaqqyccuurz8kmic",
    chester: CHESTER_REAL_PERMIT_TABLE_URL,
    "chester-demo": CHESTER_DEMO_PERMIT_TABLE_URL,
  }),
  DATASET_COVERAGE_MAP: JSON.stringify({
    chester:
      "https://ipfs.filebase.io/ipfs/QmPFSAxhSFEfJLVBwyrv6hUgHZU9LD2hY4jFewW9pcx3Hz",
    montgomery:
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dm4i5iox2hjuqarmx6b4q8ez2mh0bsgopjjsj8w2fk9bb5uk1s5",
  }),
  ORACLE_OPEN_DATA_DEFAULT_COUNTY: "chester-demo",
};

/** Bundled Lee query table path in the Lambda container image (see Dockerfile.lambda). */
export const BUNDLED_LEE_QUERY_TABLE_PATH = "/var/task/data/lee-query-table.parquet";

const propertyQueryTableMap = JSON.parse(
  ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP,
) as Record<string, string>;

/**
 * Subset of process env injected into the Lambda function for MCP stdio spawn.
 * Lee reads the build-time Parquet bundle; other counties stay on published IPNS/IPFS.
 */
export const ELEPHANT_MCP_LAMBDA_ENV: Record<string, string> = {
  ...ELEPHANT_MCP_SERVER_ENV,
  PROPERTY_QUERY_TABLE_MAP: JSON.stringify({
    ...propertyQueryTableMap,
    lee: BUNDLED_LEE_QUERY_TABLE_PATH,
  }),
};
