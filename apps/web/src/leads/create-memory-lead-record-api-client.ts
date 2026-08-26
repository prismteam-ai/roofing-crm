/**
 * In-memory LeadRecordApiClient for design tests and local shell demos.
 *
 * Mimics API persistence across React remounts when the same client instance
 * is reused — never writes to localStorage.
 */
import { parseCountyCatalogKey, type LeadRecord } from "@roofing-crm-challenge/shared";

import type {
  LeadRecordApiClient,
  LeadRecordCreateInput,
  LeadRecordListInput,
  LeadRecordManageableStatus,
} from "./lead-record-api-client";

/**
 * Options for the memory-backed LeadRecord API stand-in.
 */
export interface CreateMemoryLeadRecordApiClientOptions {
  generateLeadRecordId?: () => string;
  nowIso?: () => string;
  /**
   * When true, reuse a module-scoped Map so React remounts see prior leads
   * without localStorage (local Vite demos only).
   */
  sharedStore?: boolean;
}

/**
 * Builds a LeadRecordApiClient that keeps LeadRecords in process memory.
 *
 * Pass `sharedStore: true` (local Vite demos) so remounts reuse the same Map
 * within the module lifetime. Full browser reload still clears it — production
 * builds use HTTP → DynamoDB instead. Never writes localStorage.
 */
export function createMemoryLeadRecordApiClient(
  options: CreateMemoryLeadRecordApiClientOptions = {},
): LeadRecordApiClient {
  const leadRecordsByLeadId =
    options.sharedStore === true
      ? sharedMemoryLeadRecordsByLeadId
      : new Map<string, LeadRecord>();
  let nextIdSequence = options.sharedStore === true ? sharedMemoryNextIdSequence : 0;
  const bumpSharedSequence = () => {
    if (options.sharedStore === true) {
      sharedMemoryNextIdSequence = nextIdSequence;
    }
  };
  const generateLeadRecordId =
    options.generateLeadRecordId ??
    (() => {
      nextIdSequence += 1;
      bumpSharedSequence();
      return `01MEMORYLEAD${String(nextIdSequence).padStart(14, "0")}`;
    });
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  return {
    async createLeadRecord(input: LeadRecordCreateInput): Promise<LeadRecord> {
      const countyKey = parseCountyCatalogKey(input.county);
      for (const existing of leadRecordsByLeadId.values()) {
        if (
          existing.propertyId === input.propertyId &&
          existing.countyKey === countyKey &&
          existing.status !== "archived"
        ) {
          return structuredClone(existing);
        }
      }

      const createdAt = nowIso();
      const leadRecord: LeadRecord = {
        leadId: generateLeadRecordId(),
        propertyId: input.propertyId,
        parcelIdentifier: input.propertyId,
        countyKey,
        municipalityName: null,
        gisMuni: null,
        addressSnapshot: input.addressSnapshot ?? input.propertyId,
        builtYear: null,
        roofAgeBasis: "structure_year_built",
        structureAgeYears: null,
        openPermitIds: input.permitIds ?? [],
        maxOpenPermitYears: null,
        contractorName: null,
        bbbRating: null,
        provenanceTier: "sourced",
        leadScore: 0,
        status: "new",
        notes: input.notes ?? "",
        createdAt,
        updatedAt: createdAt,
      };
      leadRecordsByLeadId.set(leadRecord.leadId, leadRecord);
      return structuredClone(leadRecord);
    },

    async listLeadRecords(input: LeadRecordListInput = {}): Promise<LeadRecord[]> {
      const countyKeyFilter =
        input.county === undefined ? undefined : parseCountyCatalogKey(input.county);

      return [...leadRecordsByLeadId.values()]
        .filter((leadRecord) => {
          if (input.status !== undefined) {
            return leadRecord.status === input.status;
          }
          return leadRecord.status !== "archived";
        })
        .filter((leadRecord) =>
          countyKeyFilter === undefined
            ? true
            : leadRecord.countyKey === countyKeyFilter,
        )
        .map((leadRecord) => structuredClone(leadRecord))
        .sort((left, right) =>
          left.createdAt < right.createdAt
            ? -1
            : left.createdAt > right.createdAt
              ? 1
              : 0,
        );
    },

    async updateLeadRecord(
      leadId: string,
      status: LeadRecordManageableStatus,
    ): Promise<LeadRecord> {
      const existingLeadRecord = leadRecordsByLeadId.get(leadId);
      if (existingLeadRecord === undefined) {
        throw new Error(`LeadRecord not found: ${leadId}`);
      }
      if (existingLeadRecord.status === "archived") {
        throw new Error(`LeadRecord ${leadId} is archived and cannot be updated`);
      }
      const updatedLeadRecord: LeadRecord = {
        ...existingLeadRecord,
        status,
        updatedAt: nowIso(),
      };
      leadRecordsByLeadId.set(leadId, updatedLeadRecord);
      return structuredClone(updatedLeadRecord);
    },

    async archiveLeadRecord(leadId: string): Promise<LeadRecord> {
      const existingLeadRecord = leadRecordsByLeadId.get(leadId);
      if (existingLeadRecord === undefined) {
        throw new Error(`LeadRecord not found: ${leadId}`);
      }
      const archivedLeadRecord: LeadRecord = {
        ...existingLeadRecord,
        status: "archived",
        updatedAt: nowIso(),
      };
      leadRecordsByLeadId.set(leadId, archivedLeadRecord);
      return structuredClone(archivedLeadRecord);
    },
  };
}

/**
 * Module-scoped LeadRecord map for local Vite demos (survives React remount).
 */
const sharedMemoryLeadRecordsByLeadId = new Map<string, LeadRecord>();
let sharedMemoryNextIdSequence = 0;
