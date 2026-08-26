import { describe, expect, it } from "vitest";
import {
  BUNDLED_LEE_QUERY_TABLE_PATH,
  CHESTER_DEMO_PERMIT_TABLE_URL,
  CHESTER_DEMO_QUERY_TABLE_URL,
  CHESTER_GEO_INDEX_IPNS,
  CHESTER_REAL_PERMIT_TABLE_URL,
  CHESTER_REAL_QUERY_TABLE_URL,
  ELEPHANT_MCP_LAMBDA_ENV,
  ELEPHANT_MCP_SERVER_ENV,
} from "./elephant-mcp-env.js";

function parseJsonMap(envValue: string): Record<string, string> {
  return JSON.parse(envValue) as Record<string, string>;
}

describe("ELEPHANT_MCP_SERVER_ENV", () => {
  // Given the Lambda MCP maps
  // When PROPERTY_QUERY_TABLE_MAP is parsed
  // Then Chester real + demo are merged and Lee is still served
  it("merges chester and chester-demo into PROPERTY_QUERY_TABLE_MAP without dropping lee", () => {
    const propertyQueryTableMap = parseJsonMap(
      ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP ?? "",
    );

    expect(propertyQueryTableMap.lee).toMatch(/^https:\/\/ipfs\.filebase\.io\/ipns\//);
    expect(propertyQueryTableMap.chester).toBe(CHESTER_REAL_QUERY_TABLE_URL);
    expect(propertyQueryTableMap["chester-demo"]).toBe(CHESTER_DEMO_QUERY_TABLE_URL);
    expect(propertyQueryTableMap.montgomery).toBe(
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5didhiyj6zgu691d5bfbz5ard4bvor4t0x7rxca1mtw66gcc7kgu",
    );
    expect(propertyQueryTableMap.delaware).toBeUndefined();
  });

  // Given the Lambda MCP maps
  // When open-data, permit, coverage, and geo maps are parsed
  // Then Chester real IPFS CIDs and chester-demo permits/geo are present;
  // chester-demo is absent from open-data and coverage (not published)
  it("wires chester real and demo maps; demo omits open-data and coverage", () => {
    const openDataMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.ORACLE_OPEN_DATA_IPNS_MAP);
    const permitMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.PERMIT_QUERY_TABLE_MAP);
    const coverageMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.DATASET_COVERAGE_MAP);
    const geoMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.ORACLE_GEO_INDEX_IPNS_MAP);

    expect(openDataMap.chester).toBe(
      "k51qzi5uqu5dkufqw7vyai70ir7cj5fi1lrr8tmim2411p8hajjumot9qwnb98",
    );
    // Chester work must never mutate other counties' published keys.
    expect(openDataMap["palm-beach"]).toBe(
      "k51qzi5uqu5dgjnt84x8vnj2c9uwxomkpykwdvmf6xg43wwcxsifo6w1sp1wwh",
    );
    expect(openDataMap["miami-dade"]).toBe(
      "k51qzi5uqu5dk9i59xxm579a5bziprxpygv8wyi01n2ivd5kj9h5u90g1tzn1d",
    );
    expect(openDataMap.lee).toBe(
      "k51qzi5uqu5dlzgslzedrnk4whtd7ip69l0pmd3zxelz8hwjorbeyy0pyyeu4m",
    );
    expect(openDataMap["chester-demo"]).toBeUndefined();
    expect(permitMap.chester).toBe(CHESTER_REAL_PERMIT_TABLE_URL);
    expect(permitMap["chester-demo"]).toBe(CHESTER_DEMO_PERMIT_TABLE_URL);
    expect(coverageMap.chester).toBe(
      "https://ipfs.filebase.io/ipfs/QmPFSAxhSFEfJLVBwyrv6hUgHZU9LD2hY4jFewW9pcx3Hz",
    );
    expect(coverageMap["chester-demo"]).toBeUndefined();
    expect(geoMap.chester).toBe(CHESTER_GEO_INDEX_IPNS);
    expect(geoMap["chester-demo"]).toBe(CHESTER_GEO_INDEX_IPNS);
    expect(ELEPHANT_MCP_SERVER_ENV.ORACLE_OPEN_DATA_DEFAULT_COUNTY).toBe(
      "chester-demo",
    );
  });

  // Given the Lambda MCP maps
  // When montgomery keys are parsed
  // Then roof-age demo IPNS is wired and permits stay absent
  it("wires montgomery open-data, coverage, and geo without permit table", () => {
    const openDataMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.ORACLE_OPEN_DATA_IPNS_MAP);
    const permitMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.PERMIT_QUERY_TABLE_MAP);
    const coverageMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.DATASET_COVERAGE_MAP);
    const geoMap = parseJsonMap(ELEPHANT_MCP_SERVER_ENV.ORACLE_GEO_INDEX_IPNS_MAP);

    expect(openDataMap.montgomery).toBe(
      "k51qzi5uqu5dhaf7n37odyrqiaqa39170nbqc9qh8fjr0weifpif22na06hgcu",
    );
    expect(coverageMap.montgomery).toBe(
      "https://ipfs.filebase.io/ipns/k51qzi5uqu5dm4i5iox2hjuqarmx6b4q8ez2mh0bsgopjjsj8w2fk9bb5uk1s5",
    );
    expect(geoMap.montgomery).toBe(
      "k51qzi5uqu5diunnmgdou88y7zlba1in0lpk5i7834xnbh2fjq5j9ftqv7dtew",
    );
    expect(permitMap.montgomery).toBeUndefined();
  });
});

describe("ELEPHANT_MCP_LAMBDA_ENV", () => {
  // Given the hosted Lambda MCP maps
  // When PROPERTY_QUERY_TABLE_MAP is parsed
  // Then Lee uses the bundled parquet and other counties stay on IPFS/IPNS
  it("points lee at bundled parquet and keeps other counties on published URLs", () => {
    const lambdaPropertyQueryTableMap = parseJsonMap(
      ELEPHANT_MCP_LAMBDA_ENV.PROPERTY_QUERY_TABLE_MAP ?? "",
    );
    const serverPropertyQueryTableMap = parseJsonMap(
      ELEPHANT_MCP_SERVER_ENV.PROPERTY_QUERY_TABLE_MAP ?? "",
    );

    expect(lambdaPropertyQueryTableMap.lee).toBe(BUNDLED_LEE_QUERY_TABLE_PATH);
    expect(serverPropertyQueryTableMap.lee).toMatch(
      /^https:\/\/ipfs\.filebase\.io\/ipns\//,
    );
    expect(lambdaPropertyQueryTableMap.chester).toBe(
      serverPropertyQueryTableMap.chester,
    );
    expect(lambdaPropertyQueryTableMap["chester-demo"]).toBe(
      CHESTER_DEMO_QUERY_TABLE_URL,
    );
    expect(lambdaPropertyQueryTableMap["palm-beach"]).toMatch(
      /^https:\/\/ipfs\.filebase\.io\/ipns\//,
    );
  });
});
