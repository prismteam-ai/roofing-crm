"use client";

import { Fragment, useState } from "react";
import { api } from "./client";

interface Retrieved {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}
interface Reply {
  answer: string;
  retrieved: Retrieved[];
  model: string;
}

const EXAMPLES = [
  "Show me open roofing permits older than five years within five miles of Hialeah.",
  "Which properties within 2 miles of Coral Gables have roofs older than 25 years and an owner outside the county?",
  "Find long-open roofing permits near Homestead where the contractor's state licence is not Current and Active.",
  "What leads have I saved so far, and which should I call first?",
];

function Prose({ text }: { text: string }) {
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <b key={index}>{part.slice(2, -2)}</b>;
        // A Markdown link, [label](https://...), becomes a real link. Only http(s) addresses are linked.
        const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
        if (link) {
          return (
            <a key={index} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>
          );
        }
        return <Fragment key={index}>{part.replaceAll("`", "")}</Fragment>;
      })}
    </div>
  );
}

function rowsOf(output: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ["properties", "permits", "places", "leads"]) {
    const value = output?.[key];
    if (Array.isArray(value) && value.length) return value as Record<string, unknown>[];
  }
  return [];
}

function Record_({ item }: { item: Retrieved }) {
  const rows = rowsOf(item.output);
  const columns = rows[0] ? Object.keys(rows[0]).filter((c) => !["workspace", "lat", "lon"].includes(c)) : [];
  const evidence = (item.output?.evidence ?? {}) as { sql?: string | string[]; snapshot?: { id: string } };
  const total = item.output?.total_matching_properties ?? item.output?.total_matches;
  return (
    <details style={{ margin: "6px 0" }}>
      <summary>
        <b>{item.tool}</b> {JSON.stringify(item.input)}
        {total !== undefined && <> → {Number(total).toLocaleString("en-US")} matches</>}
        {rows.length > 0 && <>, {rows.length} records</>}
      </summary>
      {evidence.sql && <code className="block">{Array.isArray(evidence.sql) ? evidence.sql.join("\n\n") : evidence.sql}</code>}
      {evidence.snapshot && (
        <div className="muted" style={{ fontSize: 13 }}>
          Published snapshot <span className="mono">{evidence.snapshot.id}</span>
        </div>
      )}
      {rows.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((c) => (
                    <td key={c}>
                      {(c === "source_url" || c === "sourceUrl") && row[c] ? (
                        <a href={String(row[c])} target="_blank" rel="noreferrer">
                          county record
                        </a>
                      ) : (
                        String(row[c] ?? "—")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export function Assistant({ onLeadsChanged }: { onLeadsChanged: () => void }) {
  const [question, setQuestion] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(text = question) {
    setQuestion(text);
    setBusy(true);
    setReply(null);
    setError(null);
    try {
      const result = await api<Reply>("/api/assistant", { method: "POST", body: JSON.stringify({ question: text }) });
      setReply(result);
      if (result.retrieved.some((item) => item.tool === "save_lead")) onLeadsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="controls" style={{ alignItems: "stretch" }}>
        <textarea className="notes" style={{ flex: 1, minWidth: 260 }} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        <button className="primary" onClick={() => ask()} disabled={busy || question.trim().length < 5}>
          {busy ? "Working…" : "Ask"}
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {EXAMPLES.map((example, index) => (
          <button key={index} onClick={() => ask(example)} disabled={busy} style={{ fontSize: 13, textAlign: "left" }}>
            {example}
          </button>
        ))}
      </div>
      {error && <div className="note">{error}</div>}
      {reply && (
        <div className="card" style={{ marginTop: 12 }}>
          <Prose text={reply.answer} />
          <h3>Records retrieved for this answer</h3>
          <p className="muted" style={{ margin: "0 0 4px", fontSize: 13 }}>
            The model ({reply.model}) chose what to look up and wrote the text above. The records below are what it retrieved from the published
            county data and from your saved leads; open one to see the query and the rows.
          </p>
          {reply.retrieved.map((item, index) => (
            <Record_ key={index} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
