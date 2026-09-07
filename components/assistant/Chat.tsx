"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useMemo, useState } from "react";
import { SUGGESTED_PROMPTS } from "@/lib/agent/system-prompt";

function ToolPart({
  part,
}: {
  part: Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
}) {
  const [open, setOpen] = useState(false);
  const name = part.type.replace(/^tool-/, "");
  const input = "input" in part ? (part.input as Record<string, unknown> | undefined) : undefined;
  const output =
    part.state === "output-available"
      ? (part.output as Record<string, unknown> | undefined)
      : undefined;
  const sql =
    typeof input?.sql === "string"
      ? input.sql
      : typeof output?.sql === "string"
        ? output.sql
        : null;
  const rowCount =
    output && typeof output.rowCount === "number"
      ? output.rowCount
      : Array.isArray(output?.rows)
        ? (output.rows as unknown[]).length
        : null;
  const status =
    part.state === "output-error"
      ? "error"
      : part.state === "output-available"
        ? "done"
        : "running";
  return (
    <div className="my-1 rounded-md border border-[var(--line)] bg-gray-50 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-between px-2 py-1 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          <span className="font-mono font-semibold">{name}</span>
          {rowCount !== null && <span className="text-[var(--muted)]"> · {rowCount} rows</span>}
        </span>
        <span
          className={
            status === "error"
              ? "text-red-700"
              : status === "done"
                ? "text-green-700"
                : "text-amber-700"
          }
        >
          {status}
        </span>
      </button>
      {(open || status === "error") && (
        <div className="space-y-1 border-t border-[var(--line)] p-2">
          {sql && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px]">
              {sql}
            </pre>
          )}
          {input && !sql && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(input, null, 2)}
            </pre>
          )}
          {part.state === "output-error" && <p className="text-red-700">{part.errorText}</p>}
          {open && output && (
            <pre className="max-h-64 overflow-auto rounded bg-white p-2 font-mono text-[11px]">
              {JSON.stringify(output, null, 2).slice(0, 6000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/** Minimal markdown rendering: tables, bullet lists, paragraphs, links, bold. */
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (
          lines.length >= 2 &&
          lines[0]?.trim().startsWith("|") &&
          /^\|?\s*:?-+/.test(lines[1] ?? "")
        ) {
          const rows = lines
            .filter((l) => l.trim().startsWith("|"))
            .map((l) =>
              l
                .trim()
                .replace(/^\||\|$/g, "")
                .split("|")
                .map((c) => c.trim()),
            );
          const [head, , ...body] = rows;
          return (
            <div key={i} className="overflow-x-auto">
              <table className="min-w-full border border-[var(--line)] text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {head?.map((h, j) => (
                      <th
                        key={j}
                        className="border-b border-[var(--line)] px-2 py-1 text-left font-semibold"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, k) => (
                    <tr key={k} className="border-t border-[var(--line)]">
                      {r.map((c, j) => (
                        <td key={j} className="px-2 py-1 align-top">
                          <Inline text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*([-*]|\d+\.)\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        if (/^#{1,4}\s/.test(block))
          return (
            <h3 key={i} className="font-semibold">
              {block.replace(/^#{1,4}\s/, "")}
            </h3>
          );
        return (
          <p key={i}>
            <Inline text={block} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|https?:\/\/\S+|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(p))
          return (
            <code key={i} className="rounded bg-gray-100 px-1 font-mono text-[11px]">
              {p.slice(1, -1)}
            </code>
          );
        const md = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (md)
          return (
            <a
              key={i}
              href={md[2]}
              className="text-[var(--brand)] underline"
              target={md[2]?.startsWith("/") ? undefined : "_blank"}
              rel="noreferrer"
            >
              {md[1]}
            </a>
          );
        if (/^https?:\/\/\S+$/.test(p))
          return (
            <a
              key={i}
              href={p}
              className="break-all text-[var(--brand)] underline"
              target="_blank"
              rel="noreferrer"
            >
              {p}
            </a>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

/** Assistant chat (Vercel AI SDK `useChat`): a tool-using SQL agent with a documentation knowledge index. Shows tool calls and SQL inline. */
export function Chat({ enabled, model }: { enabled: boolean; model: string }) {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, stop } = useChat({ transport });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    if (!text.trim() || busy || !enabled) return;
    void sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-2xl rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="text-sm font-semibold">Ask about roofing opportunities</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              A tool-using SQL agent with a documentation knowledge index (lexical retrieval): it
              restates your question, resolves places, runs read-only SQL through the Elephant MCP
              server, grounds explanations in the dataset documentation and cites each row&apos;s
              source URL. Every tool call and SQL statement is shown in the transcript.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!enabled}
                  onClick={() => submit(s)}
                  className="rounded-full border border-[var(--brand)] px-3 py-1 text-left text-xs text-[var(--brand)] hover:bg-amber-50 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`mx-auto max-w-3xl ${m.role === "user" ? "flex justify-end" : ""}`}
          >
            <div
              className={`rounded-lg px-3 py-2 ${m.role === "user" ? "max-w-[80%] bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-[var(--panel)]"}`}
            >
              {m.parts.map((part, i) => {
                if (part.type === "text")
                  return m.role === "user" ? (
                    <p key={i} className="whitespace-pre-wrap text-sm">
                      {part.text}
                    </p>
                  ) : (
                    <Markdown key={i} text={part.text} />
                  );
                if (isToolUIPart(part)) return <ToolPart key={i} part={part} />;
                if (part.type === "step-start")
                  return i > 0 ? (
                    <hr key={i} className="my-2 border-dashed border-[var(--line)]" />
                  ) : null;
                return null;
              })}
            </div>
          </div>
        ))}
        {busy && <p className="mx-auto max-w-3xl text-xs text-[var(--muted)]">Thinking...</p>}
        {error && <p className="mx-auto max-w-3xl text-xs text-red-700">{error.message}</p>}
      </div>
      <form
        className="border-t border-[var(--line)] bg-[var(--panel)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!enabled}
            placeholder={
              enabled
                ? "e.g. show me open roofing permits older than five years within five miles of Kissimmee"
                : "Assistant disabled: set ANTHROPIC_API_KEY"
            }
            className="flex-1 rounded-md border border-[var(--line)] px-3 py-2 text-sm disabled:bg-gray-50"
            aria-label="Message"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!enabled || !input.trim()}
              className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
        <p className="mx-auto mt-1 max-w-3xl text-[11px] text-[var(--muted)]">
          Model: {model} via Vercel AI SDK · data via Elephant MCP · read-only SQL, capped rows.
        </p>
      </form>
    </div>
  );
}
