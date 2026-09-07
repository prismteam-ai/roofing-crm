import { Chat } from "@/components/assistant/Chat";
import { getEnv, hasAnthropicKey } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/** Assistant page (tool-using SQL agent + documentation knowledge index). Renders a clear notice when the model key is absent. */
export default function AssistantPage() {
  const enabled = hasAnthropicKey();
  const model = getEnv().AGENT_MODEL;
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-[var(--line)] bg-[var(--panel)] px-4 py-3">
        <h1 className="text-base font-semibold">Assistant</h1>
        <p className="text-xs text-[var(--muted)]">
          Natural-language roofing-opportunity queries: a tool-using SQL agent over the Elephant MCP
          dataset with a documentation knowledge index (lexical retrieval).
        </p>
      </header>
      {!enabled && (
        <div
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          role="alert"
        >
          <strong>Assistant disabled.</strong> Set <code>ANTHROPIC_API_KEY</code> (and optionally{" "}
          <code>AGENT_MODEL</code>) in the environment and restart. The map, leads and MCP data
          paths work without it.
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Chat enabled={enabled} model={model} />
      </div>
    </div>
  );
}
