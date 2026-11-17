import { respond, workspaceOf } from "@/lib/http";
import { createLead, listLeads, newLeadSchema } from "@/lib/leads";

/** The workspace's saved leads, newest first. */
export async function GET(request: Request) {
  return respond(async () => ({ leads: await listLeads(workspaceOf(request)) }));
}

/** Save a search result as a lead. Saving the same one twice changes nothing. */
export async function POST(request: Request) {
  return respond(async () => createLead(workspaceOf(request), newLeadSchema.parse(await request.json())), 201);
}
