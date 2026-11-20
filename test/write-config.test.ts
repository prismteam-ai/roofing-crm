/**
 * scripts/write-config.ts without AWS: the AWS CLI is a fake (no process is started, no network), and the secrets
 * are test values passed in (the script's .secrets/ file is never read here).
 */
import { describe, expect, test } from "vitest";
import {
  crmConfig,
  stackOutput,
  type AwsCli,
} from "../scripts/write-config.ts";

const DATA = "https://abc123.execute-api.eu-north-1.amazonaws.com";
const LEADS = "https://ghi789.execute-api.eu-north-1.amazonaws.com";
const AGENT = "https://def456.execute-api.eu-north-1.amazonaws.com";
const SECRETS = { apiToken: "test-token", mapKey: "test-map-key" };

/** A fake CLI answering describe-stacks per stack name; a missing stack fails as the CLI does. */
function fakeAws(outputs: Record<string, string>) {
  const calls: string[][] = [];
  const aws: AwsCli = (args) => {
    calls.push(args);
    const stack = args[args.indexOf("--stack-name") + 1]!;
    const out = outputs[stack];
    if (out === undefined)
      throw Object.assign(new Error("Command failed: aws"), {
        stderr: `An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id ${stack} does not exist\n`,
      });
    return `${out}\n`;
  };
  return { aws, calls };
}
const describeArgs = (stack: string, key: string) => [
  "cloudformation",
  "describe-stacks",
  "--stack-name",
  stack,
  "--profile",
  "p1",
  "--region",
  "eu-north-1",
  "--query",
  `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`,
  "--output",
  "text",
];

describe("write-config", () => {
  test("reads ApiUrl, LeadsApiUrl and AgentApiUrl from their stacks in eu-north-1 with the profile", () => {
    const { aws, calls } = fakeAws({
      OracleLaDataApi: DATA,
      RoofingCrmLeads: LEADS,
      OracleLaAgentApi: AGENT,
    });
    expect(crmConfig(aws, "p1", SECRETS)).toEqual({
      client: "crm",
      apiUrl: DATA,
      leadsApiUrl: LEADS,
      agentApiUrl: AGENT,
      apiToken: "test-token",
      mapKey: "test-map-key",
    });
    expect(calls).toEqual([
      describeArgs("OracleLaDataApi", "ApiUrl"),
      describeArgs("RoofingCrmLeads", "LeadsApiUrl"),
      describeArgs("OracleLaAgentApi", "AgentApiUrl"),
    ]);
  });

  test("without the agent stack: no agentApiUrl (the CRM hides Ask the agent), and it says so", () => {
    const { aws } = fakeAws({
      OracleLaDataApi: DATA,
      RoofingCrmLeads: LEADS,
    });
    const lines: string[] = [];
    const c = crmConfig(aws, "p1", SECRETS, (l) => lines.push(l));
    expect("agentApiUrl" in c).toBe(false);
    expect(c.leadsApiUrl).toBe(LEADS);
    expect(lines).toEqual([
      "OracleLaAgentApi not deployed: agentApiUrl omitted (Ask the agent hidden)",
    ]);
    expect(JSON.stringify(c)).not.toContain("agentApiUrl");
  });

  test("another CLI failure reading the agent stack stops the script (never a silently hidden section)", () => {
    const aws: AwsCli = (args) => {
      if (args.includes("OracleLaAgentApi"))
        throw Object.assign(new Error("Command failed: aws"), {
          stderr: "An error occurred (ExpiredToken)",
        });
      return args.includes("OracleLaDataApi") ? DATA : LEADS;
    };
    expect(() => crmConfig(aws, "p1", SECRETS)).toThrow("Command failed: aws");
  });

  test("an agent stack without the output, or with an unexpected value, stops the script", () => {
    expect(() =>
      crmConfig(
        fakeAws({ OracleLaDataApi: DATA, OracleLaAgentApi: "None" }).aws,
        "p1",
        SECRETS,
      ),
    ).toThrow("unexpected AgentApiUrl None");
    expect(() =>
      crmConfig(
        fakeAws({
          OracleLaDataApi: DATA,
          OracleLaAgentApi: "https://evil.example.com",
        }).aws,
        "p1",
        SECRETS,
      ),
    ).toThrow("unexpected AgentApiUrl https://evil.example.com");
  });

  test("leads and data API as before: leads omitted when its stack is missing; the data API stack is required", () => {
    const lines: string[] = [];
    const c = crmConfig(
      fakeAws({ OracleLaDataApi: DATA, OracleLaAgentApi: AGENT }).aws,
      "p1",
      SECRETS,
      (l) => lines.push(l),
    );
    expect(c).toEqual({
      client: "crm",
      apiUrl: DATA,
      agentApiUrl: AGENT,
      apiToken: "test-token",
      mapKey: "test-map-key",
    });
    expect(lines).toEqual([
      "RoofingCrmLeads not deployed: leadsApiUrl omitted (leads UI hidden)",
    ]);
    expect(() =>
      crmConfig(fakeAws({ OracleLaAgentApi: AGENT }).aws, "p1", SECRETS),
    ).toThrow(/OracleLaDataApi does not exist/);
    expect(
      stackOutput(
        fakeAws({ OracleLaDataApi: DATA }).aws,
        "p1",
        "OracleLaDataApi",
        "ApiUrl",
      ),
    ).toBe(DATA);
    expect(() =>
      crmConfig(
        fakeAws({ OracleLaDataApi: "https://evil.example.com" }).aws,
        "p1",
        SECRETS,
      ),
    ).toThrow("unexpected ApiUrl https://evil.example.com");
  });
});
