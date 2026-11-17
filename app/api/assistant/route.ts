import { z } from "zod";
import { ask } from "@/lib/assistant";
import { respond, workspaceOf } from "@/lib/http";

export const maxDuration = 120;

const input = z.object({ question: z.string().min(5).max(600) });

/** Ask the assistant. Returns the answer and every record it retrieved to write it. */
export async function POST(request: Request) {
  return respond(async () => ask(input.parse(await request.json()).question, workspaceOf(request)));
}
