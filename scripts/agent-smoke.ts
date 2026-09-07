/**
 * Exercise the assistant's tool layer directly against the live MCP server and CRM
 * database, without calling a language model. Useful when ANTHROPIC_API_KEY is absent.
 *
 * Usage: `npx tsx --conditions=react-server scripts/agent-smoke.ts`
 */
import { productionAgentTools } from "../lib/agent/runtime";

type Exec = {
  execute: (input: unknown, opts: { toolCallId: string; messages: [] }) => Promise<unknown>;
};
const opts = { toolCallId: "smoke", messages: [] as [] };

async function main(): Promise<void> {
  const tools = productionAgentTools() as Record<string, Exec>;
  const show = (label: string, v: unknown) =>
    console.log(`\n== ${label}\n${JSON.stringify(v, null, 1).slice(0, 2500)}`);

  show("geocodePlace Kissimmee", await tools.geocodePlace!.execute({ name: "Kissimmee" }, opts));
  const schema = (await tools.getSchema!.execute({ table: "permits" }, opts)) as {
    columns: string[];
  };
  show("getSchema permits (first 5)", schema.columns.slice(0, 5));
  show(
    "searchOpenRoofPermits: >=5y within 5mi of Kissimmee",
    await tools.searchOpenRoofPermits!.execute(
      { lat: 28.2919, lng: -81.4076, radiusMiles: 5, minYearsOpen: 5, limit: 10 },
      opts,
    ),
  );
  const leads = (await tools.searchRoofingLeads!.execute(
    { lat: 28.2919, lng: -81.4076, radiusMiles: 5, roofAgeMin: 15, limit: 5 },
    opts,
  )) as {
    totals: unknown;
    rows: unknown[];
  };
  show("searchRoofingLeads totals", leads.totals);
  show("searchRoofingLeads top rows", leads.rows);
  show(
    "searchKnowledge 'how is roof age derived'",
    await tools.searchKnowledge!.execute({ query: "how is roof age derived", limit: 2 }, opts),
  );
  show(
    "searchKnowledge 'BBB matching method'",
    await tools.searchKnowledge!.execute({ query: "BBB rating matching method", limit: 2 }, opts),
  );
  show(
    "queryProperties (raw SQL, read-only)",
    await tools.queryProperties!.execute(
      {
        sql: "SELECT address_city, count(*) n FROM properties WHERE roof_age_years >= 15 GROUP BY 1 ORDER BY n DESC",
        limit: 5,
      },
      opts,
    ),
  );
  try {
    await tools.queryProperties!.execute({ sql: "DELETE FROM properties", limit: 5 }, opts);
  } catch (err) {
    show("queryProperties rejects mutation", (err as Error).message);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
