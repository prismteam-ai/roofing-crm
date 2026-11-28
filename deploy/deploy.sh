#!/usr/bin/env bash
# Deploys the hosted CRM: the CDK stack (API, agent, DynamoDB, Amplify app), then the web build
# uploaded to the Amplify branch as a manual deployment (no Git connection needed).
#
#   deploy/deploy.sh [alarm-email]
#
# Needs AWS credentials for the target account (us-east-2) and the Claude key already stored in
# SSM (see deploy/README.md). The alarm email is passed through to CDK, never written to git.
set -euo pipefail
cd "$(dirname "$0")/.."
REGION=us-east-2
OUT=infra/cdk.out/outputs.json
bash deploy/check-oracle-pin.sh
export CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"

ctx=()
[ -n "${1:-}" ] && ctx=(-c "alarmEmail=$1")
(cd infra && npx cdk deploy RoofingCrm --require-approval never --outputs-file cdk.out/outputs.json ${ctx[@]+"${ctx[@]}"})

out() { node -e "console.log(require('./$OUT').RoofingCrm['$1'])"; }
APP_ID=$(out WebAppId); BRANCH=$(out WebBranchName); AGENT_URL=$(out AgentUrl); WEB_URL=$(out WebUrl)

# Same-origin API (/trpc is proxied by Amplify); the agent is called on its Function URL.
VITE_API_URL="" VITE_AGENT_URL="$AGENT_URL" pnpm --filter @crm/web build
ZIP="$(mktemp -d)/web.zip"
(cd apps/web/dist && zip -qr "$ZIP" .)

read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --region "$REGION" --app-id "$APP_ID" \
  --branch-name "$BRANCH" --query '[jobId, zipUploadUrl]' --output text)
curl -sf -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP" "$UPLOAD_URL"
aws amplify start-deployment --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" >/dev/null
for _ in $(seq 1 60); do
  STATUS=$(aws amplify get-job --region "$REGION" --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB_ID" \
    --query 'job.summary.status' --output text)
  case "$STATUS" in SUCCEED) break ;; FAILED|CANCELLED) echo "web deployment $STATUS" >&2; exit 1 ;; esac
  sleep 5
done
echo "web: $WEB_URL (job $JOB_ID, $STATUS)"
echo "api: $(out ApiUrl)  agent: $AGENT_URL"
