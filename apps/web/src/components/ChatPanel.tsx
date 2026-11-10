import { useState } from 'react';
import type { AgentAnswer } from '@roofing/shared';
import { api } from '../api.js';
import type { Center } from '../App.js';
import { EXAMPLE_PROMPTS } from '../lib/ui.js';

interface Turn {
  question: string;
  answer?: AgentAnswer;
  error?: string;
}

export function ChatPanel({ center, radiusMiles }: { center: Center | null; radiusMiles: number }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setTurns((t) => [...t, { question: q }]);
    try {
      const answer = await api.agent.ask.mutate({
        question: q,
        context: center ? { ...center, radiusMiles } : undefined,
      });
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x)));
    } catch (e) {
      setTurns((t) =>
        t.map((x, i) =>
          i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : String(e) } : x,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat" data-testid="chat-panel">
      <h2>Ask the agent</h2>
      <p className="hint">
        RAG over the properties and permits in the dataset. Answers cite PINs, permit ids and source
        links.
      </p>
      <div className="examples">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            onClick={() => void ask(p)}
            data-testid="example-prompt"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="turns" data-testid="chat-turns">
        {turns.map((t, i) => (
          <div key={i} className="turn">
            <div className="q" data-testid="chat-question">
              {t.question}
            </div>
            {t.answer && (
              <div className="a" data-testid="chat-answer">
                <pre>{t.answer.answer}</pre>
                <div className="meta">
                  mode: {t.answer.mode} · citations: {t.answer.citations.length} · trace{' '}
                  {t.answer.traceId.slice(0, 8)}
                </div>
                {t.answer.citations.length > 0 && (
                  <ul className="citations" data-testid="chat-citations">
                    {t.answer.citations.slice(0, 12).map((c, j) => (
                      <li key={j}>
                        {c.permitId ? `permit ${c.permitId}` : `PIN ${c.pin14}`}
                        {c.sourceUrl && (
                          <>
                            {' '}
                            ·{' '}
                            <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                              source
                            </a>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {t.error && (
              <div className="error" data-testid="chat-error">
                {t.error}
              </div>
            )}
            {!t.answer && !t.error && <div className="muted">Thinking…</div>}
          </div>
        ))}
      </div>
      <form
        className="ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. open roofing permits older than 5 years within 5 miles of Evanston"
          data-testid="chat-input"
          aria-label="Question"
        />
        <button type="submit" disabled={busy || !input.trim()} data-testid="chat-send">
          Ask
        </button>
      </form>
    </div>
  );
}
