import { z } from 'zod';
import { datasetInfoSchema, propertySchema, searchResultSchema } from '@roofing/shared';

/**
 * Pipeline MCP tool contract. The pipeline implements exactly these tool names
 * and shapes; both sides validate with these schemas.
 */
export const findPropertiesInput = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusMiles: z.number(),
  minRoofAge: z.number().optional(),
  openRoofingPermitsOnly: z.boolean().optional(),
  minOpenDays: z.number().int().optional(),
  limit: z.number().int().optional(),
});
export type FindPropertiesInput = z.infer<typeof findPropertiesInput>;
export const findPropertiesOutput = searchResultSchema;

export const getPropertyInput = z.object({ pin14: z.string().length(14) });
export const getPropertyOutput = z.object({
  property: propertySchema.nullable(),
  source: searchResultSchema.shape.source,
});

export const queryDatasetInput = z.object({
  sql: z.string(),
  limit: z.number().int().min(1).max(1000).default(100),
});
export const queryDatasetOutput = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  truncated: z.boolean().default(false),
});

export const getDatasetInfoOutput = datasetInfoSchema.extend({
  syncedAt: z.string().nullable().optional(),
});

export const mcpTools = {
  findProperties: { input: findPropertiesInput, output: findPropertiesOutput },
  getProperty: { input: getPropertyInput, output: getPropertyOutput },
  queryDataset: { input: queryDatasetInput, output: queryDatasetOutput },
  getDatasetInfo: { input: z.object({}), output: getDatasetInfoOutput },
} as const;

export interface DatasetClient {
  readonly kind: 'mcp' | 'fixture';
  findProperties(input: FindPropertiesInput): Promise<z.infer<typeof findPropertiesOutput>>;
  getProperty(pin14: string): Promise<z.infer<typeof getPropertyOutput>>;
  queryDataset(sql: string, limit?: number): Promise<z.infer<typeof queryDatasetOutput>>;
  getDatasetInfo(): Promise<z.infer<typeof getDatasetInfoOutput>>;
}
