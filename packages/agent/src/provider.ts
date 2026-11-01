import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { generateText, tool, jsonSchema } from "ai";
import { z } from "zod";
import { reviewRegion } from "../../runtime-config/src/index";

export interface ApprovedRetrieval {
  template: "verified_property_search";
  queryDigest: string;
  constraintDigest: string;
  limit: number;
  sort:
    | "distance"
    | "roof_age_desc"
    | "permit_open_days_desc"
    | "permit_issue_age_desc";
}

/** Every parameter is a server-approved literal, never an unconstrained model query. */
export function retrievalArgumentsSchema(approved: ApprovedRetrieval) {
  return z.strictObject({
    template: z.literal(approved.template),
    queryDigest: z.literal(approved.queryDigest),
    constraintDigest: z.literal(approved.constraintDigest),
    limit: z.literal(approved.limit),
    sort: z.literal(approved.sort),
  });
}

/** Nova1 accepts only these three top-level wire fields. Zod strict validation remains authoritative. */
export function retrievalWireSchema(approved: ApprovedRetrieval) {
  const strict = retrievalArgumentsSchema(approved);
  return jsonSchema<ApprovedRetrieval>(
    {
      type: "object",
      properties: {
        template: { type: "string", enum: [approved.template] },
        queryDigest: { type: "string", enum: [approved.queryDigest] },
        constraintDigest: { type: "string", enum: [approved.constraintDigest] },
        limit: { type: "integer", enum: [approved.limit] },
        sort: { type: "string", enum: [approved.sort] },
      },
      required: [
        "template",
        "queryDigest",
        "constraintDigest",
        "limit",
        "sort",
      ],
    },
    {
      validate: (input) => {
        const parsed = strict.safeParse(input);
        return parsed.success
          ? { success: true, value: parsed.data }
          : { success: false, error: parsed.error };
      },
    },
  );
}

export interface ModelRequest {
  modelId: string;
  system: string;
  prompt: string;
  approved: ApprovedRetrieval;
  maxOutputTokens: number;
}

export interface ModelContent {
  type: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  invalid?: boolean;
  text?: string;
}

export interface ModelResponse {
  content: ModelContent[];
  finishReason: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface GroundedTransport {
  converse(input: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
}

export interface ProviderOptions {
  fetch?: typeof fetch;
  credentialProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }>;
}

/** Construction does not call AWS. A single enabled invocation uses the AI SDK. */
export function bedrockTransport(
  region: string,
  options: ProviderOptions = {},
): GroundedTransport {
  reviewRegion(region);
  const provider = createAmazonBedrock({
    region,
    credentialProvider: options.credentialProvider ?? fromNodeProviderChain(),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    converse: async (request, signal) => {
      const result = await generateText({
        model: provider(request.modelId),
        system: request.system,
        prompt: request.prompt,
        temperature: 0,
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: 0,
        abortSignal: signal,
        toolChoice: { type: "tool", toolName: "retrieveProperties" },
        tools: {
          retrieveProperties: tool({
            description:
              "Execute the one approved snapshot-bound property retrieval. Copy every approved literal exactly; no other query, record ID, fact or operation is permitted.",
            inputSchema: retrievalWireSchema(request.approved),
          }),
        },
        experimental_telemetry: { isEnabled: false },
      });
      return {
        finishReason: result.finishReason,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        },
        content: result.content.map((part) =>
          part.type === "tool-call"
            ? {
                type: part.type,
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                input: part.input,
                invalid: "invalid" in part && part.invalid === true,
              }
            : {
                type: part.type,
                ...(part.type === "text" ? { text: part.text } : {}),
              },
        ),
      };
    },
  };
}
