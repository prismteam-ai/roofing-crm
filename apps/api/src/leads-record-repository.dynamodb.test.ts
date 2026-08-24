import { describe, expect, it, vi } from "vitest";
import {
  createDynamoDbLeadRecordRepository,
  mapLeadRecordToDynamoDbItem,
  type LeadRecordDynamoDbItem,
} from "./leads-record-repository.js";
import type { LeadRecord } from "@roofing-crm-challenge/shared";
import { parseCountyCatalogKey } from "@roofing-crm-challenge/shared";

const sampleLeadRecord: LeadRecord = {
  leadId: "01TESTLEAD0000000000000001",
  propertyId: "lee-prop-100",
  parcelIdentifier: "parcel-lee-prop-100",
  countyKey: parseCountyCatalogKey("lee"),
  municipalityName: "Fort Myers",
  gisMuni: null,
  addressSnapshot: "100 Palm Ave, Fort Myers, FL",
  builtYear: 1985,
  roofAgeBasis: "structure_year_built",
  structureAgeYears: 41,
  openPermitIds: [],
  maxOpenPermitYears: null,
  contractorName: null,
  bbbRating: null,
  provenanceTier: "sourced",
  leadScore: 0,
  status: "new",
  notes: "",
  createdAt: "2026-08-21T12:00:00.000Z",
  updatedAt: "2026-08-21T12:00:00.000Z",
};

describe("createDynamoDbLeadRecordRepository", () => {
  // Given a mocked DocumentClient
  // When putLeadRecord then getLeadRecordByLeadId run
  // Then the item is stored with PK/SK META keys
  it("put then get round-trips a LeadRecord", async () => {
    const storedItems = new Map<string, LeadRecordDynamoDbItem>();
    const documentClient = {
      send: vi.fn(async (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "PutCommand") {
          const item = (command as { input: { Item: LeadRecordDynamoDbItem } }).input
            .Item;
          storedItems.set(`${item.PK}#${item.SK}`, item);
          return {};
        }
        if (command.constructor.name === "GetCommand") {
          const key = (
            command as {
              input: { Key: { PK: string; SK: string } };
            }
          ).input.Key;
          const item = storedItems.get(`${key.PK}#${key.SK}`);
          return item === undefined ? {} : { Item: item };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
      }),
    };

    const repository = createDynamoDbLeadRecordRepository({
      tableName: "RoofingCrmLeads",
      documentClient: documentClient as never,
    });

    await repository.putLeadRecord(sampleLeadRecord);
    const loaded = await repository.getLeadRecordByLeadId(sampleLeadRecord.leadId);

    expect(loaded).toEqual(sampleLeadRecord);
    expect(mapLeadRecordToDynamoDbItem(sampleLeadRecord).PK).toBe(
      `LEAD#${sampleLeadRecord.leadId}`,
    );
  });

  // Given an active lead stored for a property
  // When findActiveLeadRecordByPropertyIdAndCountyKey runs
  // Then the active lead is returned
  it("findActiveLeadRecordByPropertyIdAndCountyKey queries GSI1", async () => {
    const item = mapLeadRecordToDynamoDbItem(sampleLeadRecord);
    const documentClient = {
      send: vi.fn(async () => ({
        Items: [item],
      })),
    };

    const repository = createDynamoDbLeadRecordRepository({
      tableName: "RoofingCrmLeads",
      documentClient: documentClient as never,
    });

    const found = await repository.findActiveLeadRecordByPropertyIdAndCountyKey({
      propertyId: "lee-prop-100",
      countyKey: parseCountyCatalogKey("lee"),
    });

    expect(found?.leadId).toBe(sampleLeadRecord.leadId);
    expect(documentClient.send).toHaveBeenCalledOnce();
  });

  // Given archived and active leads in a scan
  // When listLeadRecords runs without status filter
  // Then archived leads are excluded
  it("listLeadRecords excludes archived by default", async () => {
    const activeItem = mapLeadRecordToDynamoDbItem(sampleLeadRecord);
    const archivedItem = mapLeadRecordToDynamoDbItem({
      ...sampleLeadRecord,
      leadId: "01TESTLEAD0000000000000002",
      status: "archived",
    });

    const documentClient = {
      send: vi.fn(async () => ({
        Items: [activeItem, archivedItem],
      })),
    };

    const repository = createDynamoDbLeadRecordRepository({
      tableName: "RoofingCrmLeads",
      documentClient: documentClient as never,
    });

    const listed = await repository.listLeadRecords({});

    expect(listed).toHaveLength(1);
    expect(listed[0]?.status).toBe("new");
  });
});
