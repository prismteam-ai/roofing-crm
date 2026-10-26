import { useRef, useState } from "react";
import type Anthropic from "@anthropic-ai/sdk";
import { ask, type AgentResults, type MapContext, type ToolTrace } from "../lib/agent";

interface ChatMsg { role: "user" | "agent" | "error"; text: string; trace?: ToolTrace[]; results?: AgentResults }

const EXAMPLES = [
  "Aged roofs within 2 miles of Hicksville with no open permit",
  "Longest-open roofing permits near here",
  "How many open permits are within 3 miles, by roofing confidence?",
  "Roofs older than 25 years within 1 mile of the pin",
];

interface Props {
  map: MapContext;
  onResults: (r: AgentResults) => void;
  onShowMap: () => void;
}

export default function AgentView({ map, onResults, onShowMap }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<ToolTrace[]>([]);
  const history = useRef<Anthropic.MessageParam[]>([]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput(""); setBusy(true); setLive([]);
    setMsgs((m) => [...m, { role: "user", text: question }]);
    // A failed turn may have already pushed several messages (tool round-trips before the failing step).
    // Truncate back to this length on error, not just pop(), or the leftover entries corrupt the next turn.
    const startLen = history.current.length;
    try {
      const turn = await ask(history.current, question, map, (t) => setLive((l) => [...l, t]));
      if (turn.results.roofs || turn.results.permits) onResults(turn.results);
      setMsgs((m) => [...m, { role: "agent", text: turn.text, trace: turn.trace, results: turn.results }]);
    } catch (e) {
      history.current.length = startLen; // drop everything this turn added so a retry starts clean
      setMsgs((m) => [...m, { role: "error", text: String((e as Error)?.message ?? e) }]);
    } finally { setBusy(false); setLive([]); }
  }

  return (
    <div className="chat">
      <p className="muted small">
        Answers come from the same Parquet data as the map, through five fixed query tools (no free-form SQL). Map context:
        pin {map.pin.lat.toFixed(4)}, {map.pin.lon.toFixed(4)} · {map.radiusMiles} mi · roofs ≥ {map.roofAgeYears} yrs.
      </p>
      {msgs.length === 0 && (
        <div className="row">
          {EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} disabled={busy}>{e}</button>)}
        </div>
      )}
      <div className="log">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="who">{m.role === "user" ? "You" : m.role === "agent" ? "Agent" : "Error"}</div>
            <div className="body">{m.text}</div>
            {m.trace && m.trace.length > 0 && (
              <ul className="trace">{m.trace.map((t, j) => <li key={j}><code>{t.name}</code> → {t.summary}</li>)}</ul>
            )}
            {m.results && (m.results.roofs || m.results.permits) && (
              <button className="link" onClick={() => { onResults(m.results!); onShowMap(); }}>Show these results on the map →</button>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg agent">
            <div className="who">Agent</div>
            <div className="body muted">Working…</div>
            <ul className="trace">{live.map((t, j) => <li key={j}><code>{t.name}</code> → {t.summary}</li>)}</ul>
          </div>
        )}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about roofing opportunities…" disabled={busy} />
        <button className="primary" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </div>
  );
}
