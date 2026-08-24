/**
 * LeadRecord persistence port and adapters.
 *
 * Active uniqueness is (propertyId, countyKey) while status is not archived.
 * DynamoDB rows use PK/SK META items plus GSI1 keyed by propertyId.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  type DynamoDBDocumentClient as DynamoDBDocumentClientType,
} from "@aws-sdk/lib-dynamodb";
import {
  LEAD_STATUSES,
  type CountyCatalogKey,
  type LeadRecord,
  type LeadStatus,
  type RoofAgeBasis,
} from "@roofing-crm-challenge/shared";

/**
 * Snapshot fields loaded at create time from property detail.
 *
 * Identity, address, and age/permit chips are frozen on the lead so outreach
 * survives without writing back to Elephant.
 */
export type LeadRecordCreateSnapshot = Omit<
  LeadRecord,
  "leadId" | "status" | "notes" | "createdAt" | "updatedAt"
>;

/**
 * Persistence port for CRM LeadRecord snapshots.
 */
export interface LeadRecordRepository {
  putLeadRecord(leadRecord: LeadRecord): Promise<void>;
  getLeadRecordByLeadId(leadId: string): Promise<LeadRecord | null>;
  findActiveLeadRecordByPropertyIdAndCountyKey(arguments_: {
    propertyId: string;
    countyKey: CountyCatalogKey;
  }): Promise<LeadRecord | null>;
  listLeadRecords(arguments_: {
    status?: LeadStatus;
    countyKey?: CountyCatalogKey;
  }): Promise<LeadRecord[]>;
}

/**
 * DynamoDB item shape for a LeadRecord row (single-table META item).
 */
export interface LeadRecordDynamoDbItem {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  leadId: string;
  propertyId: string;
  parcelIdentifier: string;
  countyKey: string;
  municipalityName: string | null;
  gisMuni: number | null;
  addressSnapshot: string;
  builtYear: number | null;
  roofAgeBasis: RoofAgeBasis;
  structureAgeYears: number | null;
  openPermitIds: string[];
  maxOpenPermitYears: number | null;
  contractorName: string | null;
  bbbRating: string | null;
  provenanceTier: "sourced" | "synthetic_demo";
  leadScore: number;
  status: LeadStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Builds the primary and GSI key attributes for a LeadRecord.
 */
export function buildLeadRecordDynamoDbKeys(
  leadRecord: Pick<LeadRecord, "leadId" | "propertyId">,
): Pick<LeadRecordDynamoDbItem, "PK" | "SK" | "GSI1PK" | "GSI1SK"> {
  return {
    PK: `LEAD#${leadRecord.leadId}`,
    SK: "META",
    GSI1PK: `PROPERTY#${leadRecord.propertyId}`,
    GSI1SK: `LEAD#${leadRecord.leadId}`,
  };
}

/**
 * Maps a LeadRecord domain value onto the DynamoDB item contract.
 */
export function mapLeadRecordToDynamoDbItem(
  leadRecord: LeadRecord,
): LeadRecordDynamoDbItem {
  return {
    ...buildLeadRecordDynamoDbKeys(leadRecord),
    leadId: leadRecord.leadId,
    propertyId: leadRecord.propertyId,
    parcelIdentifier: leadRecord.parcelIdentifier,
    countyKey: leadRecord.countyKey,
    municipalityName: leadRecord.municipalityName,
    gisMuni: leadRecord.gisMuni,
    addressSnapshot: leadRecord.addressSnapshot,
    builtYear: leadRecord.builtYear,
    roofAgeBasis: leadRecord.roofAgeBasis,
    structureAgeYears: leadRecord.structureAgeYears,
    openPermitIds: leadRecord.openPermitIds,
    maxOpenPermitYears: leadRecord.maxOpenPermitYears,
    contractorName: leadRecord.contractorName,
    bbbRating: leadRecord.bbbRating,
    provenanceTier: leadRecord.provenanceTier,
    leadScore: leadRecord.leadScore,
    status: leadRecord.status,
    notes: leadRecord.notes,
    createdAt: leadRecord.createdAt,
    updatedAt: leadRecord.updatedAt,
  };
}

/**
 * Maps a DynamoDB item back to a LeadRecord.
 *
 * Throws when required identity fields are missing so corrupt rows fail loud.
 */
export function mapDynamoDbItemToLeadRecord(item: LeadRecordDynamoDbItem): LeadRecord {
  if (!LEAD_STATUSES.includes(item.status)) {
    throw new Error(`LeadRecordDynamoDbItem has unknown status: ${item.status}`);
  }

  return {
    leadId: item.leadId,
    propertyId: item.propertyId,
    parcelIdentifier: item.parcelIdentifier,
    countyKey: item.countyKey as CountyCatalogKey,
    municipalityName: item.municipalityName,
    gisMuni: item.gisMuni,
    addressSnapshot: item.addressSnapshot,
    builtYear: item.builtYear,
    roofAgeBasis: item.roofAgeBasis,
    structureAgeYears: item.structureAgeYears,
    openPermitIds: item.openPermitIds,
    maxOpenPermitYears: item.maxOpenPermitYears,
    contractorName: item.contractorName,
    bbbRating: item.bbbRating,
    provenanceTier: item.provenanceTier ?? "sourced",
    leadScore:
      typeof item.leadScore === "number" && Number.isFinite(item.leadScore)
        ? item.leadScore
        : 0,
    status: item.status,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * LeadRecordRepository that fails until DynamoDB env / injection is configured.
 *
 * Keeps the production router from silently accepting writes into process memory.
 */
export function createUnconfiguredLeadRecordRepository(): LeadRecordRepository {
  const message =
    "LeadRecord DynamoDB repository is not configured; set LEAD_RECORD_TABLE_NAME or inject leadRecordRepository in createLeadsRouter";

  return {
    async putLeadRecord(): Promise<void> {
      throw new Error(message);
    },
    async getLeadRecordByLeadId(): Promise<LeadRecord | null> {
      throw new Error(message);
    },
    async findActiveLeadRecordByPropertyIdAndCountyKey(): Promise<LeadRecord | null> {
      throw new Error(message);
    },
    async listLeadRecords(): Promise<LeadRecord[]> {
      throw new Error(message);
    },
  };
}

/**
 * DynamoDB LeadRecordRepository for Lambda production.
 */
export function createDynamoDbLeadRecordRepository(options: {
  tableName: string;
  documentClient?: DynamoDBDocumentClientType;
}): LeadRecordRepository {
  const documentClient =
    options.documentClient ??
    DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });

  return {
    async putLeadRecord(leadRecord: LeadRecord): Promise<void> {
      await documentClient.send(
        new PutCommand({
          TableName: options.tableName,
          Item: mapLeadRecordToDynamoDbItem(leadRecord),
        }),
      );
    },

    async getLeadRecordByLeadId(leadId: string): Promise<LeadRecord | null> {
      const response = await documentClient.send(
        new GetCommand({
          TableName: options.tableName,
          Key: {
            PK: `LEAD#${leadId}`,
            SK: "META",
          },
        }),
      );

      if (response.Item === undefined) {
        return null;
      }

      return mapDynamoDbItemToLeadRecord(response.Item as LeadRecordDynamoDbItem);
    },

    async findActiveLeadRecordByPropertyIdAndCountyKey(arguments_: {
      propertyId: string;
      countyKey: CountyCatalogKey;
    }): Promise<LeadRecord | null> {
      const response = await documentClient.send(
        new QueryCommand({
          TableName: options.tableName,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :gsi1pk",
          ExpressionAttributeValues: {
            ":gsi1pk": `PROPERTY#${arguments_.propertyId}`,
          },
        }),
      );

      for (const item of response.Items ?? []) {
        const leadRecord = mapDynamoDbItemToLeadRecord(item as LeadRecordDynamoDbItem);
        if (
          leadRecord.countyKey === arguments_.countyKey &&
          leadRecord.status !== "archived"
        ) {
          return leadRecord;
        }
      }

      return null;
    },

    async listLeadRecords(arguments_: {
      status?: LeadStatus;
      countyKey?: CountyCatalogKey;
    }): Promise<LeadRecord[]> {
      const statusFilter = arguments_.status;
      const countyKeyFilter = arguments_.countyKey;

      const response = await documentClient.send(
        new ScanCommand({
          TableName: options.tableName,
          FilterExpression: "SK = :meta",
          ExpressionAttributeValues: {
            ":meta": "META",
          },
        }),
      );

      return (response.Items ?? [])
        .map((item) => mapDynamoDbItemToLeadRecord(item as LeadRecordDynamoDbItem))
        .filter((leadRecord) => {
          if (statusFilter !== undefined) {
            return leadRecord.status === statusFilter;
          }
          return leadRecord.status !== "archived";
        })
        .filter((leadRecord) =>
          countyKeyFilter === undefined
            ? true
            : leadRecord.countyKey === countyKeyFilter,
        )
        .sort((left, right) =>
          left.createdAt < right.createdAt
            ? -1
            : left.createdAt > right.createdAt
              ? 1
              : 0,
        );
    },
  };
}

/**
 * In-memory LeadRecordRepository for Vitest and local demos without DynamoDB.
 */
export function createInMemoryLeadRecordRepository(): LeadRecordRepository {
  const leadRecordsByLeadId = new Map<string, LeadRecord>();

  return {
    async putLeadRecord(leadRecord: LeadRecord): Promise<void> {
      leadRecordsByLeadId.set(leadRecord.leadId, structuredClone(leadRecord));
    },

    async getLeadRecordByLeadId(leadId: string): Promise<LeadRecord | null> {
      const leadRecord = leadRecordsByLeadId.get(leadId);
      return leadRecord ? structuredClone(leadRecord) : null;
    },

    async findActiveLeadRecordByPropertyIdAndCountyKey(arguments_: {
      propertyId: string;
      countyKey: CountyCatalogKey;
    }): Promise<LeadRecord | null> {
      for (const leadRecord of leadRecordsByLeadId.values()) {
        if (
          leadRecord.propertyId === arguments_.propertyId &&
          leadRecord.countyKey === arguments_.countyKey &&
          leadRecord.status !== "archived"
        ) {
          return structuredClone(leadRecord);
        }
      }
      return null;
    },

    async listLeadRecords(arguments_: {
      status?: LeadStatus;
      countyKey?: CountyCatalogKey;
    }): Promise<LeadRecord[]> {
      const statusFilter = arguments_.status;
      const countyKeyFilter = arguments_.countyKey;

      return [...leadRecordsByLeadId.values()]
        .filter((leadRecord) => {
          if (statusFilter !== undefined) {
            return leadRecord.status === statusFilter;
          }
          // Default list is outreach-active — archived soft-deletes stay out.
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
  };
}
