// AWS Lambda entry (kit deployment shape: tRPC router on Lambda behind API Gateway HTTP API).
// Not deployed for this assessment; see infra/cdk and docs/kit-usage.md.
import { handle } from 'hono/aws-lambda';
import { bootstrap } from './bootstrap.js';

export const handler = handle(bootstrap().app);
