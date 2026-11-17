import { respond } from "@/lib/http";
import { callOracle } from "@/lib/oracle";

/** Resolve a city name to coordinates through the Oracle pipeline. */
export async function GET(request: Request) {
  return respond(() => callOracle("find_place", { name: new URL(request.url).searchParams.get("name") ?? "" }));
}
