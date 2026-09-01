import { useState } from 'react';
import type { LatLon } from '@roofing-crm/shared';
import { AGENT_PROXY_URL } from '../config.js';
import type { Citation } from '../lib/agent.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  usedLlm?: boolean;
  centerUsed?: LatLon;
}

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onAsk: (question: string) => void;
  onSelectCitation: (parcelId: string, center: LatLon) => void;
}

const EXAMPLES = [
  'open roofing permits older than five years within five miles of Merritt Island',
  'roofs older than 20 years within 10 miles of Cocoa',
  'stalled permits near Rockledge',
];

/**
 * State (messages/loading) is owned by App.tsx, not here -- this component
 * remounts every time the nav view changes (it lives inside a ternary), so
 * owning its own history would silently wipe the conversation the moment a
 * citation click switches to the map view.
 */
export function AgentChat({ messages, loading, onAsk, onSelectCitation }: Props) {
  const [input, setInput] = useState('');

  return (
    <div className="pipeline agent-chat">
      <div className="pipeline__toolbar">
        <h2 className="panel__title agent-chat__title">Ask the agent</h2>
        <span className={`tier-chip ${AGENT_PROXY_URL ? 'tier-chip--A' : 'tier-chip--UNKNOWN'}`}>
          {AGENT_PROXY_URL ? 'Gemini available' : 'Deterministic mode (no LLM key)'}
        </span>
      </div>

      <p className="muted">
        Questions are answered by running a real query against the live dataset — an LLM, when available,
        only helps parse the question and phrase the reply; it never invents an address, permit number, or parcel id.
      </p>

      {messages.length === 0 ? (
        <div className="agent-chat__examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="btn btn--ghost btn--sm" onClick={() => onAsk(ex)}>
              {ex}
            </button>
          ))}
        </div>
      ) : null}

      <div className="agent-chat__messages">
        {messages.map((m) => (
          <div key={m.id} className={`agent-chat__msg agent-chat__msg--${m.role}`}>
            <div className="agent-chat__bubble">
              <pre className="agent-chat__text">{m.text}</pre>
              {m.usedLlm ? <span className="tier-chip tier-chip--B">Gemini</span> : null}
              {m.citations && m.citations.length > 0 && m.centerUsed ? (
                <div className="agent-chat__citations">
                  {m.citations.map((c) => (
                    <button
                      key={c.parcelId}
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onSelectCitation(c.parcelId, m.centerUsed!)}
                      title={c.parcelId}
                    >
                      {c.permitNumber ?? c.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading ? <p className="muted">Querying the live dataset…</p> : null}
      </div>

      <form
        className="row agent-chat__input-row"
        onSubmit={(e) => { e.preventDefault(); if (input.trim()) { onAsk(input); setInput(''); } }}
      >
        <input
          className="lead-card__note-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about open permits, roof age, or a place in Brevard…"
        />
        <button type="submit" className="btn" disabled={loading || !input.trim()}>Ask</button>
      </form>
    </div>
  );
}
