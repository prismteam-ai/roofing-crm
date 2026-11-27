// The DynamoDB Local endpoint the leads-db global setup provides to every test.
declare module "vitest" {
  export interface ProvidedContext {
    dynamoEndpoint: string;
  }
}
export {};
