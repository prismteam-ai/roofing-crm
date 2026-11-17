import { NotFound, respond, workspaceOf } from "@/lib/http";
import { deleteLead, leadPatchSchema, updateLead } from "@/lib/leads";

/** Change a lead's status, priority or notes. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/leads/[leadId]">) {
  const { leadId } = await ctx.params;
  return respond(async () => {
    const lead = await updateLead(workspaceOf(request), leadId, leadPatchSchema.parse(await request.json()));
    if (!lead) throw new NotFound("No such lead in this workspace");
    return { lead };
  });
}

/** Remove a lead. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/leads/[leadId]">) {
  const { leadId } = await ctx.params;
  return respond(async () => {
    await deleteLead(workspaceOf(request), leadId);
    return { deleted: leadId };
  });
}
