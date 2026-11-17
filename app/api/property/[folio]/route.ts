import { respond } from "@/lib/http";
import { callOracle, type PropertyDetail } from "@/lib/oracle";

/** One property with every county permit filed against it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/property/[folio]">) {
  const { folio } = await ctx.params;
  return respond(() => callOracle<PropertyDetail>("get_property", { folio }));
}
