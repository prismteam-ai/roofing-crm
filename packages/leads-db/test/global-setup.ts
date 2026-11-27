import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    dynamoEndpoint: string;
  }
}

let container: StartedTestContainer | undefined;

/** DynamoDB Local for the repository tests: `DYNAMODB_ENDPOINT` if set, else a container. */
export async function setup(project: TestProject) {
  let endpoint = process.env.DYNAMODB_ENDPOINT;
  if (!endpoint) {
    container = await new GenericContainer("amazon/dynamodb-local:2.5.4")
      .withCommand(["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"])
      .withExposedPorts(8000)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  }
  project.provide("dynamoEndpoint", endpoint);
}

export async function teardown() {
  await container?.stop();
}
