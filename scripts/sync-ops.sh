#!/usr/bin/env bash
# Operator commands for the crm-sync pipeline (see docs/runbook.md). Uses the `assess` AWS profile.
#   scripts/sync-ops.sh status             show the served and previous manifest CIDs, counts, DLQ depth
#   scripts/sync-ops.sh rollback [--yes]   point the served index back at `previous` (no redeploy, no rebuild)
#   scripts/sync-ops.sh replay             start a crm-sync execution for the served CID and wait for it
# `rollback` only swaps the pointer in DynamoDB. The old index files stay in S3, so it takes seconds.
# A later deploy re-reads DATA_MANIFEST_CID: set the GitHub variable to the CID you rolled back to.
set -euo pipefail

export AWS_REGION="${AWS_REGION:-eu-north-1}"
PROFILE="${AWS_PROFILE:-assess}"
TABLE="${CRM_LEADS_TABLE:-crm-leads}"
aws_() {
  # Exported credentials win; otherwise the named profile (after `aws login --profile assess`).
  if [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then aws --region "$AWS_REGION" "$@"; else aws --profile "$PROFILE" --region "$AWS_REGION" "$@"; fi
}

pointer() {
  aws_ dynamodb get-item --table-name "$TABLE" \
    --key '{"pk":{"S":"META#index"},"sk":{"S":"META"}}' \
    --query 'Item.{current:current.S,previous:previous.S,properties:propertyCount.N,permits:permitCount.N,promotedAt:promotedAt.S}' \
    --output json
}

cmd="${1:-status}"
case "$cmd" in
  status)
    pointer
    DLQ_URL="$(aws_ sqs get-queue-url --queue-name crm-sync-fetch-part-dlq --query QueueUrl --output text)"
    echo "FetchPart DLQ messages: $(aws_ sqs get-queue-attributes --queue-url "$DLQ_URL" \
      --attribute-names ApproximateNumberOfMessages --query 'Attributes.ApproximateNumberOfMessages' --output text)"
    ;;
  rollback)
    CURRENT="$(pointer | python3 -c 'import sys,json;print(json.load(sys.stdin)["current"])')"
    PREVIOUS="$(pointer | python3 -c 'import sys,json;print(json.load(sys.stdin).get("previous") or "")')"
    if [ -z "$PREVIOUS" ] || [ "$PREVIOUS" = "None" ]; then echo "No previous index to roll back to." >&2; exit 1; fi
    BUCKET="${CRM_INDEX_BUCKET:-crm-index}"
    aws_ s3 ls "s3://$BUCKET/index/$PREVIOUS/crm_property.parquet" >/dev/null \
      || { echo "The previous index files are not in s3://$BUCKET/index/$PREVIOUS/." >&2; exit 1; }
    echo "Served now : $CURRENT"
    echo "Roll back to: $PREVIOUS"
    if [ "${2:-}" != "--yes" ]; then echo "Dry run. Add --yes to flip the pointer."; exit 0; fi
    aws_ dynamodb update-item --table-name "$TABLE" \
      --key '{"pk":{"S":"META#index"},"sk":{"S":"META"}}' \
      --update-expression 'SET current = :prev, previous = :cur, rolledBackAt = :now' \
      --condition-expression 'current = :cur' \
      --expression-attribute-values "{\":prev\":{\"S\":\"$PREVIOUS\"},\":cur\":{\"S\":\"$CURRENT\"},\":now\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"
    echo "Pointer flipped. Warm API instances reload the index within their cache window; to force it bump INDEX_SCHEMA_VERSION and deploy CrmApi."
    echo "Set the GitHub variable DATA_MANIFEST_CID to $PREVIOUS so the next deploy does not move forward again."
    ;;
  replay)
    CID="$(pointer | python3 -c 'import sys,json;print(json.load(sys.stdin)["current"])')"
    SM="$(aws_ stepfunctions list-state-machines --query "stateMachines[?name=='crm-sync'].stateMachineArn | [0]" --output text)"
    EX="$(aws_ stepfunctions start-execution --state-machine-arn "$SM" --name "$CID-replay-$(date +%s)" \
      --input "{\"manifestCidHint\":\"$CID\",\"forceRebuild\":true}" --query executionArn --output text)"
    echo "Started $EX"
    until [ "$(aws_ stepfunctions describe-execution --execution-arn "$EX" --query status --output text)" != RUNNING ]; do sleep 10; done
    aws_ stepfunctions describe-execution --execution-arn "$EX" --query '{status:status,error:error,output:output}' --output json
    echo "If the run succeeded, purge the DLQ so its alarm returns to OK: aws sqs purge-queue --queue-url <DLQ url>"
    ;;
  *) echo "Usage: $0 status|rollback [--yes]|replay" >&2; exit 2 ;;
esac
