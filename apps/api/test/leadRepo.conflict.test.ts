// B-07 TC-007 (found live): 20 simultaneous creates on one key made DynamoDB cancel some of the
// losing transactions with TransactionConflict *before* any condition was evaluated. Those
// callers must retry until they see the real outcome ("Already a lead"), never surface a 500.
import { describe, expect, it } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createDynamoLeadRepo, LeadAlreadyExistsError } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { newLead } from "./support/leadFixtures.js";

function conflict(): Error {
  return Object.assign(new Error("Transaction cancelled"), {
    name: "TransactionCanceledException",
    CancellationReasons: [{ Code: "TransactionConflict" }, { Code: "None" }, { Code: "None" }],
  });
}

/** A client whose first `n` sends fail with TransactionConflict, then delegates. */
function conflictingClient(table: FakeLeadsTable, n: number): DynamoDBDocumentClient {
  const real = table.client();
  let left = n;
  return {
    send: (command: unknown) => {
      if (left > 0) {
        left -= 1;
        return Promise.reject(conflict());
      }
      return (real as unknown as { send(c: unknown): Promise<unknown> }).send(command);
    },
  } as unknown as DynamoDBDocumentClient;
}

const noSleep = (): Promise<void> => Promise.resolve();

describe("leadRepo.create under TransactionConflict", () => {
  it("retries a conflicted create and then succeeds when the key is still free", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({
      tableName: "crm-leads",
      client: conflictingClient(table, 2),
      sleep: noSleep,
    });
    await expect(repo.create(newLead())).resolves.toMatchObject({ status: "new" });
    expect(table.items.size).toBe(3);
  });

  it("retries a conflicted create and reports Already a lead when the winner has landed", async () => {
    const table = new FakeLeadsTable();
    await createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() }).create(
      newLead(),
    );
    const repo = createDynamoLeadRepo({
      tableName: "crm-leads",
      client: conflictingClient(table, 3),
      sleep: noSleep,
    });
    await expect(repo.create(newLead({ leadId: "01JOTHER" }))).rejects.toBeInstanceOf(
      LeadAlreadyExistsError,
    );
  });

  it("gives up after a bounded number of attempts and surfaces the conflict", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({
      tableName: "crm-leads",
      client: conflictingClient(table, 99),
      sleep: noSleep,
    });
    await expect(repo.create(newLead())).rejects.toMatchObject({
      name: "TransactionCanceledException",
    });
    expect(table.items.size).toBe(0);
  });
});
