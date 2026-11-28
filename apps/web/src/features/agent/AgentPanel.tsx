import type { AgentAnswer, ChatTurn } from "@crm/agent/schema";
import { type FormEvent, useState } from "react";
import { API_URL } from "../../lib/trpc.ts";
import { useSearch } from "../../state.tsx";

/** Hosted: the agent's Lambda Function URL; locally the API server's /agent (Vite proxy). */
export const AGENT_URL = (import.meta.env.VITE_AGENT_URL as string | undefined) ?? `${API_URL}/agent`;

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; answer: AgentAnswer }
  | { role: "error"; content: string };

export async function askAgent(
  body: {
    message: string;
    history: ChatTurn[];
    mapContext?: { center: { lat: number; lon: number }; radiusMiles: number };
  },
  fetchImpl: typeof fetch = fetch,
): Promise<AgentAnswer> {
  let res: Response;
  try {
    res = await fetchImpl(AGENT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The assistant is unreachable. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as AgentAnswer & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The assistant failed (HTTP ${res.status}).`);
  return data;
}

function Answer({ a, onShow }: { a: AgentAnswer; onShow(): void }) {
  return (
    <div className="answer">
      <p className="answer-text">{a.text}</p>
      {a.assumptions.length ? (
        <div className="assumptions">
          <strong>Assumptions</strong>
          <ul>
            {a.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {a.missingData.length ? (
        <div className="missing">
          <strong>Missing data</strong>
          <ul>
            {a.missingData.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {a.results.length ? (
        <button type="button" onClick={onShow}>
          Show {a.results.length} result{a.results.length === 1 ? "" : "s"} on map
        </button>
      ) : null}
      <details className="evidence">
        <summary>
          Retrieved evidence ({a.steps.length} tool call{a.steps.length === 1 ? "" : "s"})
        </summary>
        <ol>
          {a.steps.map((s, i) => (
            <li key={i}>
              <code>{s.tool}</code> <span className="muted">{JSON.stringify(s.args)}</span> → {s.rowCount} row
              {s.rowCount === 1 ? "" : "s"}
              {s.sample.length ? <span className="muted"> (e.g. {s.sample.join(", ")})</span> : null}
              {s.error ? <span className="notice"> {s.error}</span> : null}
            </li>
          ))}
        </ol>
        {a.citations.length ? (
          <>
            <strong>Sources</strong>
            <ul className="links">
              {a.citations.map((c) => (
                <li key={`${c.permitId ?? c.propertyId}-${c.sourceUrl}`}>
                  <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener">
                    {c.permitId ?? `parcel ${c.propertyId}`}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
    </div>
  );
}

/** Natural-language questions over the Oracle's records, with retrieved evidence and map results. */
export function AgentPanel({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const { search, setAgentResults, setCenter } = useSearch();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const history: ChatTurn[] = turns.flatMap((t): ChatTurn[] =>
    t.role === "user"
      ? [{ role: "user", content: t.content }]
      : t.role === "assistant"
        ? [{ role: "assistant", content: t.answer.text.slice(0, 20_000), context: t.answer.context }]
        : [],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = message.trim();
    if (!q || pending) return;
    setMessage("");
    setTurns((t) => [...t, { role: "user", content: q }]);
    setPending(true);
    try {
      const answer = await askAgent(
        {
          message: q,
          history: history.slice(-20),
          mapContext: { center: search.center, radiusMiles: search.radiusMiles },
        },
        fetchImpl,
      );
      setTurns((t) => [...t, { role: "assistant", answer }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "error", content: (err as Error).message }]);
    } finally {
      setPending(false);
    }
  }

  function show(a: AgentAnswer) {
    setAgentResults(a.results);
    if (a.context.center) setCenter(a.context.center, "agent", a.context.placeName ?? null);
  }

  return (
    <section className="agent" aria-label="Ask about roofing opportunities">
      <h2>Ask the lead assistant</h2>
      <ol className="chat" data-testid="chat">
        {turns.map((t, i) => (
          <li key={i} className={t.role}>
            {t.role === "assistant" ? (
              <Answer a={t.answer} onShow={() => show(t.answer)} />
            ) : (
              <p>{t.content}</p>
            )}
          </li>
        ))}
        {pending ? <li className="assistant muted">Searching the records…</li> : null}
      </ol>
      <form onSubmit={submit} className="row">
        <label className="grow">
          Question
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="e.g. open roofing permits older than five years within five miles of Fort Lauderdale"
          />
        </label>
        <button type="submit" className="primary" disabled={pending || !message.trim()}>
          Ask
        </button>
      </form>
    </section>
  );
}
