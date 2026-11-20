/**
 * Leads router: one item per parcel in the leads table. Writes are conditional (create: the lead must not
 * exist; update and delete: `updated_at` must still be the value the client last saw), so a stale write
 * is a CONFLICT instead of a silent overwrite. Notes are never logged. A lead's source_permit is written only by
 * create (when given); update sets status, notes and updated_at only.
 */
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { TRPCError } from "@trpc/server";
import {
  createInput,
  deleteInput,
  getInput,
  type Lead,
  type LeadList,
  listInput,
  updateInput,
} from "./schema.ts";
import { type Ctx, procedure, router } from "./trpc.ts";

const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message });

/** Runs a write; records LeadWritten on success and LeadWriteFailed on an unexpected error. */
async function write<T>(
  ctx: Ctx,
  action: string,
  parcel_id: string,
  run: () => Promise<T>,
  onConditionFailed: string,
): Promise<T> {
  try {
    const out = await run();
    ctx.metrics.addMetric("LeadWritten", "Count", 1);
    ctx.logger.info("lead written", { action, parcel_id });
    return out;
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException)
      throw conflict(onConditionFailed);
    ctx.metrics.addMetric("LeadWriteFailed", "Count", 1);
    ctx.logger.error("lead write failed", {
      action,
      parcel_id,
      error: (e as Error).name,
    });
    throw e;
  }
}

export const leadsRouter = router({
  list: procedure.input(listInput).query(async ({ ctx, input }) => {
    const res = await ctx.db.send(
      new ScanCommand({
        TableName: ctx.tableName,
        Limit: input.limit,
        ExclusiveStartKey: input.cursor
          ? { parcel_id: input.cursor }
          : undefined,
      }),
    );
    const out: LeadList = {
      items: (res.Items ?? []) as Lead[],
      next_cursor:
        (res.LastEvaluatedKey?.parcel_id as string | undefined) ?? null,
    };
    return out;
  }),

  get: procedure.input(getInput).query(async ({ ctx, input }) => {
    const res = await ctx.db.send(
      new GetCommand({ TableName: ctx.tableName, Key: input }),
    );
    return (res.Item as Lead | undefined) ?? null;
  }),

  create: procedure.input(createInput).mutation(async ({ ctx, input }) => {
    const at = ctx.now().toISOString();
    const item: Lead = { ...input, created_at: at, updated_at: at };
    return write(
      ctx,
      "create",
      input.parcel_id,
      async () => {
        await ctx.db.send(
          new PutCommand({
            TableName: ctx.tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(parcel_id)",
          }),
        );
        return item;
      },
      "a lead for this parcel already exists",
    );
  }),

  update: procedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const sets = ["updated_at = :now"];
    const values: Record<string, unknown> = {
      ":now": ctx.now().toISOString(),
      ":seen": input.expected_updated_at,
    };
    if (input.status !== undefined) {
      sets.push("#status = :status");
      values[":status"] = input.status;
    }
    if (input.notes !== undefined) {
      sets.push("notes = :notes");
      values[":notes"] = input.notes;
    }
    return write(
      ctx,
      "update",
      input.parcel_id,
      async () => {
        const res = await ctx.db.send(
          new UpdateCommand({
            TableName: ctx.tableName,
            Key: { parcel_id: input.parcel_id },
            UpdateExpression: `SET ${sets.join(", ")}`,
            ConditionExpression:
              "attribute_exists(parcel_id) AND updated_at = :seen",
            ExpressionAttributeNames:
              input.status !== undefined ? { "#status": "status" } : undefined,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW",
          }),
        );
        return res.Attributes as Lead;
      },
      "the lead was changed or deleted elsewhere; reload it",
    );
  }),

  delete: procedure.input(deleteInput).mutation(async ({ ctx, input }) => {
    return write(
      ctx,
      "delete",
      input.parcel_id,
      async () => {
        await ctx.db.send(
          new DeleteCommand({
            TableName: ctx.tableName,
            Key: { parcel_id: input.parcel_id },
            ConditionExpression: "updated_at = :seen",
            ExpressionAttributeValues: { ":seen": input.expected_updated_at },
          }),
        );
        return { parcel_id: input.parcel_id, deleted: true as const };
      },
      "the lead was changed or deleted elsewhere; reload it",
    );
  }),
});

export const appRouter = router({ leads: leadsRouter });
export type AppRouter = typeof appRouter;
