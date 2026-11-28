# Hosted CRM (AWS, CDK, Amplify)

**Live:** https://main.dvy80s6giizfb.amplifyapp.com — public; each browser gets its own demo
workspace (httpOnly cookie, 7 days) seeded with leads, so visitors never see each other's leads.

Everything is in `us-east-2`, tagged `project_name=roofing-crm` (stack `RoofingCrm`, `infra/`):

| Piece | What |
|---|---|
| Amplify app (`main` branch) | The `apps/web` build, uploaded as a manual deployment. Custom rules proxy `/trpc/*` and `/health` to the API, so the browser talks to one origin and the workspace cookie is first-party; every other path without a file extension serves the SPA |
| API Lambda (Node 22, arm64) | `apps/api/src/lambda.ts`: the tRPC router behind an API Gateway HTTP API (`ANY /trpc/{proxy+}`, `GET /health`); 29 s timeout |
| Agent Lambda | `apps/api/src/agent-lambda.ts` on a Function URL (60 s, longer than API Gateway's 30 s); CORS limited to the Amplify domain; the Claude key from SSM at cold start |
| DynamoDB | One on-demand table: leads, demo workspaces and agent counters (TTL `expiresAt`), point-in-time recovery, retained on stack delete |
| Alarms | API and agent Lambda errors, HTTP API 5xx, agent tokens ≥ 80% of the daily budget → SNS email; AWS Budgets $5/month |
| `deploy/hosted.json` | Settings (no secrets): Oracle URLs and manifest CID, agent model, budgets |
| `.github/workflows/uptime.yml` | Checks the web URL, `/health` through Amplify and the Oracle every 30 minutes |

The CRM reads the hosted Oracle (`deploy/hosted.json`), pinned to one manifest CID; rows from any
other run are refused.

## One-time setup

1. AWS credentials, default region `us-east-2`; `npx cdk bootstrap` once.
2. The Claude key in SSM (shared with the Oracle), typed into a hidden prompt:
   ```sh
   read -s "K?Anthropic key: " && aws ssm put-parameter --region us-east-2 \
     --name /roofing/anthropic-key --type SecureString --overwrite --value "$K"; unset K
   ```
3. Activate `project_name` as a cost allocation tag (Billing → Cost allocation tags) so the
   monthly budget, which filters on it, sees the stack's cost.

## Deploy

```sh
pnpm install
deploy/deploy.sh <alarm-email>    # cdk deploy RoofingCrm, then build apps/web and upload it to Amplify
```

The alarm email goes to CDK as context and is never committed; confirm the SNS subscription email
after the first deploy. To move to a new Oracle run, redeploy the Oracle on it, set
`oracleManifestCid` here to the same CID, and run `deploy/deploy.sh` again.

## Check it

```sh
W=https://main.dvy80s6giizfb.amplifyapp.com
curl -s $W/health                                   # through the Amplify proxy
BASE_URL=$W pnpm e2e                                # the demo transcript, both browser profiles
```

## Measured (first deploy)

| | |
|---|---|
| Web (Amplify) | ~0.2 s |
| API cold start | ~0.6 s init; a warm new-workspace request (seeding leads) ~1.1 s, a returning one ~0.3 s |
| Agent (Sonnet 5.5) | a 3-tool question in ~36 s / 240k tokens before tool results were compacted for the model (`compactForModel`), far less after |

## Cost (estimate, list prices)

Idle: about $0.50–1/month (four alarms $0.40, logs; Lambda, API Gateway, DynamoDB and Amplify
stay inside the free tier at demo traffic). The agent is billed by Anthropic, capped at 500k
tokens a day
(2M since a grading run used up the 500k first set: about $8/day worst case on Sonnet 5.5).

## Oracle pin

`deploy/hosted.json` pins the Oracle twice: `oracleManifestCid` (the data run the CRM reads; the
API refuses rows from any other run) and `oracleCommit` (the Oracle source whose `contract` export
the CRM builds against). CI checks out exactly `oracleCommit`, and `deploy/deploy.sh` stops unless
the sibling checkout is at that commit (`deploy/check-oracle-pin.sh`). To move either pin, change
it here, run the checks and redeploy.
