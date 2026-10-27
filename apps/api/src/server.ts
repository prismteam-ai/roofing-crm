import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  DomainError,
  LeadCreateSchema,
  LeadUpdateSchema,
  QuerySchema,
} from "../../../packages/contracts/src/index";
import { OracleClient } from "../../../packages/oracle-client/src/index";
import { LeadStore } from "../../../packages/lead-domain/src/index";
import { answerQuestion } from "../../../packages/agent/src/index";
const oracle = new OracleClient(
  process.env.ORACLE_API_URL ?? "http://127.0.0.1:4310",
);
const leads = new LeadStore(process.env.LEAD_DB_PATH ?? "data/leads.sqlite");
async function body(req: IncomingMessage): Promise<unknown> {
  let s = "";
  for await (const part of req) {
    s += String(part);
    if (Buffer.byteLength(s) > 64000)
      throw new DomainError("INVALID_INPUT", "Request too large");
  }
  try {
    return JSON.parse(s || "{}") as unknown;
  } catch {
    throw new DomainError("INVALID_INPUT", "Invalid JSON");
  }
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/health")
      return send(res, 200, {
        ok: true,
        mode: "local-fixture",
        snapshotId: "demo-oakland-v1",
        contractVersion: "0.1.0",
      });
    if (req.method === "POST" && url.pathname === "/api/search")
      return send(
        res,
        200,
        await oracle.search(QuerySchema.parse(await body(req))),
      );
    if (req.method === "GET" && url.pathname.startsWith("/api/properties/"))
      return send(
        res,
        200,
        await oracle.detail(
          decodeURIComponent(url.pathname.split("/").pop() ?? ""),
          url.searchParams.get("snapshotId") ?? "demo-oakland-v1",
        ),
      );
    if (req.method === "GET" && url.pathname === "/api/leads")
      return send(
        res,
        200,
        leads.list(url.searchParams.get("sessionId") ?? ""),
      );
    if (req.method === "POST" && url.pathname === "/api/leads") {
      const input = LeadCreateSchema.parse(await body(req));
      await oracle.detail(input.propertyId, input.snapshotId);
      return send(res, 200, leads.create(input));
    }
    if (req.method === "PATCH" && url.pathname.startsWith("/api/leads/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const input = LeadUpdateSchema.parse({
        ...((await body(req)) as Record<string, unknown>),
        id,
      });
      return send(res, 200, leads.update(id, input));
    }
    if (req.method === "POST" && url.pathname === "/api/agent") {
      const x = (await body(req)) as Record<string, unknown>;
      if (typeof x.prompt !== "string")
        throw new DomainError("INVALID_INPUT", "Agent prompt required");
      return send(
        res,
        200,
        await answerQuestion(oracle, x.prompt, QuerySchema.parse(x.query)),
      );
    }
    send(res, 404, { code: "INVALID_INPUT", message: "Local route not found" });
  } catch (error) {
    const e = error as Error;
    const domain = error instanceof DomainError;
    send(
      res,
      domain
        ? error.code === "CONFLICT"
          ? 409
          : error.code === "NOT_AUTHORIZED"
            ? 403
            : 400
        : 400,
      {
        code: domain ? error.code : "INVALID_INPUT",
        message:
          e.name === "ZodError"
            ? "Invalid request fields"
            : domain
              ? e.message
              : "Local request could not be completed. Check the Oracle service.",
      },
    );
  }
});
server.listen(Number(process.env.PORT ?? 4311), "127.0.0.1", () =>
  process.stdout.write("CRM local API ready on http://127.0.0.1:4311\n"),
);
process.on("SIGTERM", () =>
  server.close(() => {
    leads.close();
    process.exit(0);
  }),
);
