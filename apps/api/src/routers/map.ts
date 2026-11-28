import { SearchInput } from "@crm/shared";
import { procedure, router } from "../trpc.ts";

export const mapRouter = router({
  search: procedure.input(SearchInput).query(({ ctx, input }) => ctx.deps.oracle.search(input)),
});
