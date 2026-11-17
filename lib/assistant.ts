import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMCPClient } from "@ai-sdk/mcp";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { createLead, listLeads, newLeadSchema } from "./leads";
import { ORACLE_MCP_URL } from "./oracle";

/**
 * The CRM assistant: retrieval-augmented answers about roofing opportunities.
 *
 * Retrieval is not a vector index. The assistant retrieves records by calling
 * the Oracle pipeline's MCP tools (radius searches over the published property
 * and permit tables) and the CRM's own lead tools, then writes its answer from
 * what came back. Every retrieved record is returned beside the answer.
 *
 * - The model chooses tools and words the reply.
 * - Facts come only from tool results.
 * - Saving a lead is a tool the model may call only when the user asks for it.
 */

// Measured on the Gemini free tier: newer models time out or return "high demand".
const MODELS = (process.env.AGENT_MODELS ?? "gemini-3.5-flash-lite,gemini-3-flash-preview,gemini-3.5-flash").split(",").map((m) => m.trim());
// A healthy answer takes 4 to 25 seconds; a longer wait is a hung call, better abandoned for the next model.
const ATTEMPT_TIMEOUT_MS = 40_000;
/** The whole question must finish inside the function's 120 s limit. */
const BUDGET_MS = 100_000;
/** The free model tier often answers "high demand" or hangs for a few seconds, so the list of models is tried up to twice, within the budget. */
const ATTEMPTS = [...MODELS, ...MODELS];
/** The Oracle tools the assistant may use. `query_sql` is left out: a sales assistant has no need for open SQL. */
const ORACLE_TOOLS = ["find_place", "search_properties", "search_permits", "get_property"];

const SYSTEM = `You are the assistant inside a roofing company's lead CRM for Miami-Dade County, Florida.

You find roofing opportunities by calling tools over published county property and permit records, and you can read and add to the user's saved leads.

Rules:
- Use the tools for every fact. Never state a count, address, owner, date or contractor that did not come from a tool result.
- When a question names a place, call find_place first, then search around the coordinates it returns. Use the radius the question gives; if it gives none, use 3 miles and say so.
- "Older than N years" means minRoofAge N. "Open more than N years" means minDaysOpen N x 365. Report the total number of matches and list at most 8.
- For each property give the address, roof year and its basis: "roof permit" (a completed roof permit) or "year built" (a proxy; county permits start in 2020).
- For each permit give the permit number, issue date, how long it has been open, the contractor name and licence number, and the state licence standing if one was found. Say "no approved final inspection on record" rather than calling a permit legally open.
- To find permits by the contractor's state licence, use the contractorLicence filter of search_permits ("problem" = Probation, Suspended or Inactive; "not_in_state_file"; "current_active"). Do not search repeatedly hoping to filter by eye.
- One or two searches are normally enough. If a search cannot express what was asked, say so and answer with the closest search.
- BBB ratings are not in the data. Say so; do not guess. Where a permit has a bbb_profile_url, give it as "BBB profile (matched by name)" so the user can read the rating there.
- Only call save_lead when the user explicitly asks to save or add a lead. Say which leads you saved.
- End with a short "Assumptions and gaps" line.
- Be concise.`;

let keyPromise: Promise<string> | null = null;
function modelKey(): Promise<string> {
  keyPromise ??= (async () => {
    const parameter = process.env.GEMINI_KEY_PARAMETER;
    if (!parameter) {
      const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!key) throw new Error("No language model key is configured");
      return key;
    }
    const result = await new SSMClient({}).send(new GetParameterCommand({ Name: parameter, WithDecryption: true }));
    if (!result.Parameter?.Value) throw new Error(`SSM parameter ${parameter} is empty`);
    return result.Parameter.Value;
  })().catch((error) => {
    keyPromise = null;
    throw error;
  });
  return keyPromise;
}

export interface Retrieved {
  tool: string;
  input: unknown;
  output: unknown;
}

/** MCP tool results arrive as text content holding JSON; unwrap them for display. */
function unwrap(output: unknown): unknown {
  const text = (output as { content?: { type: string; text?: string }[] })?.content?.find((part) => part.type === "text")?.text;
  if (typeof text !== "string") return output;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function ask(question: string, workspace: string): Promise<{ answer: string; retrieved: Retrieved[]; model: string }> {
  const oracle = await createMCPClient({ transport: { type: "http", url: ORACLE_MCP_URL } });
  try {
    const oracleTools = await oracle.tools();
    const tools = {
      ...Object.fromEntries(Object.entries(oracleTools).filter(([name]) => ORACLE_TOOLS.includes(name))),
      list_leads: tool({
        description: "List the leads the user has already saved in this CRM, with status, priority and notes.",
        inputSchema: z.object({}),
        execute: async () => ({ leads: await listLeads(workspace) }),
      }),
      save_lead: tool({
        description:
          "Save one property (and optionally one permit) as a lead in the CRM. Only use when the user asks to save or add a lead. " +
          "Copy the values from a search result; do not invent any. Use null for every field the search result does not contain.",
        inputSchema: newLeadSchema,
        execute: async (input) => {
          // A roof lead has no permit. Drop anything the model put in those fields
          // (it has written placeholder text such as "None on record" there).
          const clean =
            input.reason === "aging_roof"
              ? { ...input, permitNumber: null, permitIssued: null, permitStatus: null, contractor: null, contractorLicence: null }
              : input;
          const { lead, created } = await createLead(workspace, clean);
          return { saved: created, already_existed: !created, leadId: lead.leadId, address: lead.address };
        },
      }),
    };

    const google = createGoogleGenerativeAI({ apiKey: await modelKey() });
    let lastError: unknown;
    const started = Date.now();
    for (const [attempt, model] of ATTEMPTS.entries()) {
      const left = BUDGET_MS - (Date.now() - started);
      if (left < 5_000) break;
      if (attempt > 0 && attempt % MODELS.length === 0) await new Promise((resolve) => setTimeout(resolve, 2_500));
      try {
        const result = await generateText({
          model: google(model),
          system: SYSTEM,
          prompt: question,
          tools,
          stopWhen: isStepCount(8),
          temperature: 0,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, left)),
        });
        const retrieved = result.steps.flatMap((step) =>
          step.toolResults.map((r) => ({ tool: r.toolName, input: r.input, output: unwrap(r.output) })),
        );
        // If the model used every step on tool calls it leaves no text; say so instead of returning nothing.
        const answer = result.text.trim() || "I ran several searches but did not reach a written answer. The records I retrieved are listed below.";
        return { answer, retrieved, model };
      } catch (error) {
        lastError = error;
        console.error(`Assistant model ${model} failed:`, error instanceof Error ? error.message : error);
      }
    }
    throw new Error(`The language model is unavailable right now (${lastError instanceof Error ? lastError.message : "unknown error"}). Search and leads still work.`);
  } finally {
    await oracle.close();
  }
}
