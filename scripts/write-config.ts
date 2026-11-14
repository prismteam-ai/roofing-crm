/**
 * Write <dist>/config.json for the deployed CRM: absolute API URL (OracleLaDataApi output), leads API URL
 * (RoofingCrmLeads output; omitted, with the leads UI hidden, while that stack does not exist), agent API URL
 * (OracleLaAgentApi output AgentApiUrl; omitted, with the "Ask the agent" section hidden, only when that stack
 * does not exist: any other failure to read it stops the script), the CRM API token and the Amazon Location map
 * key (both from .secrets/). Prints nothing secret. The stack outputs are read with the AWS CLI profile named in
 * AWS_PROFILE; the script stops if it is unset.
 * Usage: AWS_PROFILE=<profile> node scripts/write-config.ts <dist-dir>
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REGION = "eu-north-1";
/** An HTTP API's default endpoint in the stacks' region, as every output read here gives it. */
export const API_URL =
  /^https:\/\/[a-z0-9]+\.execute-api\.eu-north-1\.amazonaws\.com$/;

/** Runs the AWS CLI with these arguments and returns its stdout (throws on a non-zero exit, stderr in the error). */
export type AwsCli = (args: string[]) => string;

export class StackMissingError extends Error {
  constructor(stack: string) {
    super(`stack ${stack} does not exist`);
    this.name = "StackMissingError";
  }
}

/** One stack output as the CLI prints it (trimmed); StackMissingError when the stack does not exist. */
export function stackOutput(
  aws: AwsCli,
  profile: string,
  stack: string,
  key: string,
): string {
  try {
    return aws([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stack,
      "--profile",
      profile,
      "--region",
      REGION,
      "--query",
      `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue`,
      "--output",
      "text",
    ]).trim();
  } catch (err) {
    const stderr = String(
      (err as { stderr?: unknown }).stderr ?? (err as Error).message ?? "",
    );
    if (/Stack with id \S+ does not exist/.test(stderr))
      throw new StackMissingError(stack);
    throw err;
  }
}

export interface CrmConfig {
  client: "crm";
  apiUrl: string;
  leadsApiUrl?: string;
  agentApiUrl?: string;
  apiToken: string;
  mapKey: string;
}

/** config.json's content from the stack outputs and the two secrets. */
export function crmConfig(
  aws: AwsCli,
  profile: string,
  secrets: { apiToken: string; mapKey: string },
  log: (line: string) => void = () => {},
): CrmConfig {
  const apiUrl = stackOutput(aws, profile, "OracleLaDataApi", "ApiUrl");
  if (!API_URL.test(apiUrl)) throw new Error(`unexpected ApiUrl ${apiUrl}`);
  let leadsApiUrl: string | undefined;
  try {
    leadsApiUrl = stackOutput(aws, profile, "RoofingCrmLeads", "LeadsApiUrl");
  } catch {
    log("RoofingCrmLeads not deployed: leadsApiUrl omitted (leads UI hidden)");
  }
  if (leadsApiUrl !== undefined && !API_URL.test(leadsApiUrl))
    throw new Error(`unexpected LeadsApiUrl ${leadsApiUrl}`);
  let agentApiUrl: string | undefined;
  try {
    agentApiUrl = stackOutput(aws, profile, "OracleLaAgentApi", "AgentApiUrl");
  } catch (err) {
    if (!(err instanceof StackMissingError)) throw err;
    log(
      "OracleLaAgentApi not deployed: agentApiUrl omitted (Ask the agent hidden)",
    );
  }
  if (agentApiUrl !== undefined && !API_URL.test(agentApiUrl))
    throw new Error(`unexpected AgentApiUrl ${agentApiUrl}`);
  return {
    client: "crm",
    apiUrl,
    ...(leadsApiUrl ? { leadsApiUrl } : {}),
    ...(agentApiUrl ? { agentApiUrl } : {}),
    apiToken: secrets.apiToken,
    mapKey: secrets.mapKey,
  };
}

const awsCli: AwsCli = (args) =>
  execFileSync("aws", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function main(argv: string[], env: NodeJS.ProcessEnv): void {
  const dist = argv[0];
  if (!dist) throw new Error("usage: write-config.ts <dist-dir>");
  const profile = env.AWS_PROFILE;
  if (!profile)
    throw new Error(
      "AWS_PROFILE is not set: name the AWS CLI profile for the target account, e.g. AWS_PROFILE=<profile> node scripts/write-config.ts <dist-dir>",
    );
  const s = JSON.parse(
    readFileSync(new URL("../.secrets/crm.json", import.meta.url), "utf8"),
  ) as { apiToken: string; mapKey: string };
  const config = crmConfig(awsCli, profile, s, console.log);
  writeFileSync(join(dist, "config.json"), JSON.stringify(config));
  console.log(
    `wrote ${join(dist, "config.json")} (apiUrl ${config.apiUrl}, leadsApiUrl ${config.leadsApiUrl ?? "none"}, agentApiUrl ${config.agentApiUrl ?? "none"}; token and key not shown)`,
  );
}

// Run only as a script (the test imports the functions above).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2), process.env);
