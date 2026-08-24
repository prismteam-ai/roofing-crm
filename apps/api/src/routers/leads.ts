/**
 * Leads domain router.
 *
 * Persists CRM LeadRecord snapshots (create / list / update / archive).
 * Create is idempotent on an active (propertyId, countyKey) pair so reload
 * never duplicates outreach. Elephant property facts are never mutated here.
 */
import {
  parseCountyCatalogKey,
  type CountyCatalogKey,
  type LeadRecord,
} from "@roofing-crm-challenge/shared";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  createUnconfiguredLeadRecordRepository,
  type LeadRecordCreateSnapshot,
  type LeadRecordRepository,
} from "../leads-record-repository.js";
import { publicProcedure, router } from "../trpc.js";

/**
 * Dependencies for the leads router.
 *
 * Injectable so Vitest can use an in-memory LeadRecordRepository and fixed
 * clocks / ids. Production swaps in DynamoDB when the table env is wired.
 */
export interface LeadsRouterDependencies {
  leadRecordRepository: LeadRecordRepository;
  loadLeadRecordCreateSnapshot: (arguments_: {
    propertyId: string;
    countyKey: CountyCatalogKey;
    permitIds?: string[];
  }) => Promise<LeadRecordCreateSnapshot>;
  generateLeadRecordId: () => string;
  nowIso: () => string;
}

const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "lost",
  "won",
  "archived",
]);

const leadRecordSchema = z.object({
  leadId: z.string().min(1),
  propertyId: z.string().min(1),
  parcelIdentifier: z.string(),
  countyKey: z.string().min(1),
  municipalityName: z.string().nullable(),
  gisMuni: z.number().int().nullable(),
  addressSnapshot: z.string(),
  builtYear: z.number().int().nullable(),
  roofAgeBasis: z.literal("structure_year_built"),
  structureAgeYears: z.number().int().nullable(),
  openPermitIds: z.array(z.string()),
  maxOpenPermitYears: z.number().nullable(),
  contractorName: z.string().nullable(),
  bbbRating: z.string().nullable(),
  provenanceTier: z.enum(["sourced", "synthetic_demo"]),
  leadScore: z.number().int().min(0).max(100),
  status: leadStatusSchema,
  notes: z.string(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

const leadsCreateInputSchema = z.object({
  propertyId: z.string().min(1),
  county: z.string().min(1),
  permitIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const leadsListInputSchema = z.object({
  status: leadStatusSchema.optional(),
  county: z.string().min(1).optional(),
});

const leadsUpdateInputSchema = z.object({
  leadId: z.string().min(1),
  status: leadStatusSchema
    .refine((status) => status !== "archived", {
      message: "Use leads.archive to soft-delete; update cannot set archived",
    })
    .optional(),
  notes: z.string().optional(),
});

const leadsArchiveInputSchema = z.object({
  leadId: z.string().min(1),
});

/**
 * Crockford Base32 alphabet used by ULID (no I, L, O, U).
 */
const ULID_ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generates a 26-character ULID for LeadRecord.leadId.
 *
 * Time-sortable ids keep list order stable without a separate sequence table.
 */
export function generateUlidLeadRecordId(nowMilliseconds: number = Date.now()): string {
  let time = nowMilliseconds;
  const timeCharacters: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    timeCharacters.unshift(ULID_ENCODING[time % 32]!);
    time = Math.floor(time / 32);
  }

  const randomness = randomBytes(16);
  const randomCharacters: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    randomCharacters.push(ULID_ENCODING[randomness[index]! % 32]!);
  }

  return `${timeCharacters.join("")}${randomCharacters.join("")}`;
}

/**
 * Creates a LeadRecord from a property snapshot at outreach start.
 */
export function buildLeadRecordFromCreateSnapshot(arguments_: {
  leadId: string;
  snapshot: LeadRecordCreateSnapshot;
  notes: string;
  createdAt: string;
}): LeadRecord {
  return {
    ...arguments_.snapshot,
    leadId: arguments_.leadId,
    status: "new",
    notes: arguments_.notes,
    createdAt: arguments_.createdAt,
    updatedAt: arguments_.createdAt,
  };
}

/**
 * Builds the leads tRPC router over an injectable LeadRecordRepository.
 */
export function createLeadsRouter(dependencies: LeadsRouterDependencies) {
  return router({
    /**
     * Creates a LeadRecord snapshot, or returns the existing active one.
     *
     * Idempotent on (propertyId, countyKey) while status is not archived.
     */
    create: publicProcedure
      .input(leadsCreateInputSchema)
      .output(leadRecordSchema)
      .mutation(async ({ ctx, input }) => {
        const countyKey = parseCountyCatalogKey(input.county);
        ctx.logger.debug("leads.create", {
          propertyId: input.propertyId,
          countyKey,
        });

        const existingLeadRecord =
          await dependencies.leadRecordRepository.findActiveLeadRecordByPropertyIdAndCountyKey(
            {
              propertyId: input.propertyId,
              countyKey,
            },
          );

        if (existingLeadRecord) {
          return existingLeadRecord;
        }

        const snapshot = await dependencies.loadLeadRecordCreateSnapshot({
          propertyId: input.propertyId,
          countyKey,
          permitIds: input.permitIds,
        });
        const createdAt = dependencies.nowIso();
        const leadRecord = buildLeadRecordFromCreateSnapshot({
          leadId: dependencies.generateLeadRecordId(),
          snapshot,
          notes: input.notes ?? "",
          createdAt,
        });

        await dependencies.leadRecordRepository.putLeadRecord(leadRecord);
        return leadRecord;
      }),

    /**
     * Lists LeadRecords, defaulting to non-archived outreach rows.
     */
    list: publicProcedure
      .input(leadsListInputSchema)
      .output(z.array(leadRecordSchema))
      .query(async ({ ctx, input }) => {
        const countyKey =
          input.county === undefined ? undefined : parseCountyCatalogKey(input.county);
        ctx.logger.debug("leads.list", {
          status: input.status,
          countyKey,
        });

        return dependencies.leadRecordRepository.listLeadRecords({
          status: input.status,
          countyKey,
        });
      }),

    /**
     * Updates status and/or notes on an existing non-archived LeadRecord.
     */
    update: publicProcedure
      .input(leadsUpdateInputSchema)
      .output(leadRecordSchema)
      .mutation(async ({ ctx, input }) => {
        ctx.logger.debug("leads.update", { leadId: input.leadId });

        const existingLeadRecord =
          await dependencies.leadRecordRepository.getLeadRecordByLeadId(input.leadId);
        if (!existingLeadRecord) {
          throw new Error(`LeadRecord not found: ${input.leadId}`);
        }
        if (existingLeadRecord.status === "archived") {
          throw new Error(
            `LeadRecord ${input.leadId} is archived and cannot be updated`,
          );
        }

        const updatedLeadRecord: LeadRecord = {
          ...existingLeadRecord,
          status: input.status ?? existingLeadRecord.status,
          notes: input.notes ?? existingLeadRecord.notes,
          updatedAt: dependencies.nowIso(),
        };

        await dependencies.leadRecordRepository.putLeadRecord(updatedLeadRecord);
        return updatedLeadRecord;
      }),

    /**
     * Soft-deletes a LeadRecord by setting status to archived.
     */
    archive: publicProcedure
      .input(leadsArchiveInputSchema)
      .output(leadRecordSchema)
      .mutation(async ({ ctx, input }) => {
        ctx.logger.debug("leads.archive", { leadId: input.leadId });

        const existingLeadRecord =
          await dependencies.leadRecordRepository.getLeadRecordByLeadId(input.leadId);
        if (!existingLeadRecord) {
          throw new Error(`LeadRecord not found: ${input.leadId}`);
        }

        const archivedLeadRecord: LeadRecord = {
          ...existingLeadRecord,
          status: "archived",
          updatedAt: dependencies.nowIso(),
        };

        await dependencies.leadRecordRepository.putLeadRecord(archivedLeadRecord);
        return archivedLeadRecord;
      }),
  });
}

/**
 * Production leads router.
 *
 * Persistence throws until `LEAD_RECORD_TABLE_NAME` (or an injected repository)
 * is wired by the Lambda/CDK story. Unit tests inject an in-memory repository.
 */
export const leadsRouter = createLeadsRouter({
  leadRecordRepository: createUnconfiguredLeadRecordRepository(),
  loadLeadRecordCreateSnapshot: loadLeadRecordCreateSnapshot,
  generateLeadRecordId: generateUlidLeadRecordId,
  nowIso: () => new Date().toISOString(),
});

/**
 * Loads create-time snapshot fields from property detail transport.
 *
 * Throws until properties.get / MCP is wired for production create.
 */
export async function loadLeadRecordCreateSnapshot(_arguments: {
  propertyId: string;
  countyKey: CountyCatalogKey;
  permitIds?: string[];
}): Promise<LeadRecordCreateSnapshot> {
  throw new Error(
    "LeadRecord create snapshot transport is not configured; inject loadLeadRecordCreateSnapshot in createLeadsRouter or wire properties.get in the Lambda handler",
  );
}
