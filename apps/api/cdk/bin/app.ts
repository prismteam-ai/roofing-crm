import * as cdk from 'aws-cdk-lib';
import { RoofingCrmStack } from '../lib/api-stack.js';

const app = new cdk.App();

const oracleMcpUrl =
  (app.node.tryGetContext('oracleMcpUrl') as string | undefined) ?? process.env.ORACLE_MCP_URL;
if (!oracleMcpUrl) {
  throw new Error('Pass the Oracle MCP endpoint: cdk deploy -c oracleMcpUrl=https://.../mcp');
}

new RoofingCrmStack(app, 'RoofingCrmStack', {
  basePath: 'roofing-crm',
  oracleMcpUrl,
  agentProvider: (app.node.tryGetContext('agentProvider') as string | undefined) ?? 'anthropic',
  agentModel: app.node.tryGetContext('agentModel') as string | undefined,
  agentKeyParameter:
    (app.node.tryGetContext('agentKeyParameter') as string | undefined) ??
    '/roofing-crm/anthropic-api-key',
  alarmEmail: app.node.tryGetContext('alarmEmail') as string | undefined,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' },
});
