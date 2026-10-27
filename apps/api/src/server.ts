import { createServer } from "node:http";
import { OracleClient } from "../../../packages/oracle-client/src/index";
import { LeadStore } from "../../../packages/lead-domain/src/index";
import { createApp } from "./app";
if (
  process.env.PRISM_ACCESS_MODE !== "local" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME
)
  throw new Error(
    "Local server requires explicit PRISM_ACCESS_MODE=local outside Lambda",
  );
const leads = new LeadStore(process.env.LEAD_DB_PATH ?? "data/leads.sqlite");
const app = createApp({
  oracle: new OracleClient(
    process.env.ORACLE_API_URL ?? "http://127.0.0.1:4310",
    fetch,
    {
      approvedOrigins: (process.env.ORACLE_APPROVED_ORIGINS ?? "")
        .split(",")
        .filter(Boolean),
      allowLoopback: true,
    },
  ),
  leads,
});
const server = createServer(async (req, res) => {
  let raw = "";
  try {
    for await (const part of req) {
      raw += String(part);
      if (Buffer.byteLength(raw) > 64000) {
        res.writeHead(413);
        res.end('{"code":"INVALID_INPUT","message":"Request too large"}');
        return;
      }
    }
  } catch {
    if (!res.destroyed) {
      res.writeHead(400);
      res.end('{"code":"INVALID_INPUT","message":"Request interrupted"}');
    }
    return;
  }
  let body: unknown;
  try {
    body = raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    res.writeHead(400);
    res.end('{"code":"INVALID_INPUT","message":"Invalid JSON"}');
    return;
  }
  const result = await app({
    method: req.method ?? "GET",
    path: req.url ?? "/",
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join("; ") : v,
      ]),
    ),
    body,
  });
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
});
server.listen(Number(process.env.PORT ?? 4311), "127.0.0.1", () =>
  process.stdout.write("CRM local API ready on loopback\n"),
);
process.on("SIGTERM", () =>
  server.close(() => {
    leads.close();
    process.exit(0);
  }),
);
