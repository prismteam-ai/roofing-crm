import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasAnthropicKey } from "@/lib/config/env";
import { getAgentModel } from "@/lib/agent/model";
import { productionAgentTools } from "@/lib/agent/runtime";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Minimal UIMessage shape accepted from the client (extra fields pass through). */
const uiMessageSchema = z
  .object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.object({ type: z.string() }).passthrough()).min(1),
  })
  .passthrough();

/** Request body for POST /api/chat. */
export const chatBodySchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(60),
});

/** POST /api/chat - Vercel AI SDK UI-message stream for the assistant. */
export async function POST(req: Request) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured; the assistant is disabled." },
      { status: 503 },
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request", detail: "Body must be JSON" },
      { status: 400 },
    );
  }
  const parsed = chatBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues.slice(0, 10) },
      { status: 400 },
    );
  }
  const messages = parsed.data.messages.slice(-20) as unknown as UIMessage[];
  const result = streamText({
    model: getAgentModel(),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: productionAgentTools(),
    stopWhen: stepCountIs(10),
    onError: ({ error }) => console.error("assistant error", error),
  });
  return result.toUIMessageStreamResponse({
    onError: (error) => (error instanceof Error ? error.message : "The assistant failed"),
  });
}
