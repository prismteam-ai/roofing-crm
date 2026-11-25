import {
  awsLambdaRequestHandler,
  type CreateAWSLambdaContextOptions,
} from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from 'aws-lambda';
import { buildContext, logger, metrics, tracer, type Services } from './context.js';
import { appRouter } from './routers/index.js';
import { buildServices } from './services.js';

let services: Services | null = null;

const trpcHandler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: ({ event }: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => {
    services ??= buildServices(process.env);
    return buildContext(services, event.headers['x-workspace-id']);
  },
  onError: ({ error, path }) => {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      logger.critical('unhandled procedure failure', { path, error: error.message });
    }
  },
});

/** API Gateway HTTP API (v2) entry point. CORS is handled by the gateway, not here. */
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> => {
  logger.addContext(context);
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('trpc');
  try {
    return await trpcHandler(event, context);
  } finally {
    subsegment?.close();
    metrics.publishStoredMetrics();
  }
};
