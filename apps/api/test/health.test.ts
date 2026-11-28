import type { AddressInfo } from "node:net";
import { expect, test } from "vitest";
import { loadEnv } from "../src/env.ts";
import { createApiServer } from "../src/server.ts";

const CID = "bafkreigdrq3tmzv6wk4ymglnlncrxflgsdkcw6g4z6hmzbbtdtp4lxvdqi";

test("loadEnv requires the Oracle API, MCP URL and expected manifest", () => {
  expect(() => loadEnv({})).toThrow(/ORACLE_API_URL.*ORACLE_MCP_URL.*ORACLE_MANIFEST_CID/);
  expect(() =>
    loadEnv({ ORACLE_API_URL: "http://x", ORACLE_MCP_URL: "http://x/mcp", ORACLE_MANIFEST_CID: "" }),
  ).toThrow(/ORACLE_MANIFEST_CID/);
  const env = loadEnv({
    ORACLE_API_URL: "http://x",
    ORACLE_MCP_URL: "http://x/mcp",
    ORACLE_MANIFEST_CID: CID,
  });
  expect(env).toMatchObject({ ORACLE_MANIFEST_CID: CID, LEADS_TABLE: "roofing-crm-leads", PORT: 4318 });
});

test("GET /health returns ok with the pinned manifest and the Oracle views version", async () => {
  const server = createApiServer({ manifestCid: CID }).listen(0);
  try {
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      manifestCid: CID,
      viewsVersion: "roofing-views.v1",
      agentConfigured: false,
    });
  } finally {
    server.close();
  }
});
