import type { AgentAnswer, Point } from '@roofing-crm/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTRPC } from '../lib/api.js';
import { describeError } from '../lib/format.js';
import { Notice } from './fields.js';
import type { AgentPoint } from './MapView.js';

export interface AgentPanelProps {
  pin: Point | null;
  radiusMiles: number;
  /** Null when the API reports no language model; undefined while that is still unknown. */
  agentModel: string | null | undefined;
  pointsOnMap: number;
  onShowPoints: (points: AgentPoint[]) => void;
  onClearPoints: () => void;
  onOpenProperty: (apn: string) => void;
}

export const EXAMPLE_QUESTIONS = [
  'Show me open roofing permits older than five years within five miles of Chula Vista',
  'Which properties within five miles of La Jolla have roofs older than 15 years?',
  'Who is the listed contractor on the longest-open roofing permits near Escondido?',
  'Which properties near this pin have not changed owner in more than 10 years?',
  'How many open roofing permits are there within two miles of this pin, and which is oldest?',
] as const;

const MAX_QUESTION = 600;
const ROWS_SHOWN = 25;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function ResultTable({
  rows,
  onOpenProperty,
}: {
  rows: AgentAnswer['rows'];
  onOpenProperty: (apn: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const shown = showAll ? rows : rows.slice(0, ROWS_SHOWN);
  return (
    <section aria-labelledby="agent-rows-title" data-testid="agent-rows">
      <h4 id="agent-rows-title">Result rows ({rows.length})</h4>
      <div className="table-scroll">
        <table className="mini-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => {
                  const text = cellText(row[column]);
                  return (
                    <td key={column}>
                      {column === 'apn' && /^[A-Za-z0-9-]{3,32}$/.test(text) ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            onOpenProperty(text);
                          }}
                        >
                          {text}
                        </button>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > ROWS_SHOWN && (
        <button
          type="button"
          className="btn btn-small"
          data-testid="agent-rows-toggle"
          onClick={() => {
            setShowAll((all) => !all);
          }}
        >
          {showAll ? `Show first ${String(ROWS_SHOWN)}` : `Show all ${String(rows.length)} rows`}
        </button>
      )}
    </section>
  );
}

function Answer({ answer, props }: { answer: AgentAnswer; props: AgentPanelProps }) {
  const notConfigured = answer.model === 'none';
  return (
    <div className="agent-answer" data-testid="agent-answer">
      {notConfigured ? (
        <Notice kind="info" testId="agent-not-configured">
          <strong>Agent not configured.</strong> {answer.answer}
        </Notice>
      ) : (
        // Rendered as text: React escapes it, and CSS keeps the line breaks.
        <p className="agent-text" data-testid="agent-text">
          {answer.answer}
        </p>
      )}

      {answer.points.length > 0 && (
        <div className="agent-map-actions">
          <button
            type="button"
            className="btn btn-primary btn-small"
            data-testid="agent-show-on-map"
            onClick={() => {
              props.onShowPoints(answer.points);
            }}
          >
            Show on map ({answer.points.length})
          </button>
          {props.pointsOnMap > 0 && (
            <button
              type="button"
              className="btn btn-small"
              data-testid="agent-clear-map"
              onClick={props.onClearPoints}
            >
              Clear from map
            </button>
          )}
        </div>
      )}

      {answer.assumptions.length > 0 && (
        <section aria-labelledby="agent-assumptions-title" data-testid="agent-assumptions">
          <h4 id="agent-assumptions-title">Assumptions</h4>
          <ul>
            {answer.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      )}

      {answer.evidence.length > 0 && (
        <section aria-labelledby="agent-evidence-title" data-testid="agent-evidence">
          <h4 id="agent-evidence-title">Evidence ({answer.evidence.length} tool calls)</h4>
          <ol className="evidence">
            {answer.evidence.map((item, index) => (
              <li key={index} data-testid="agent-evidence-item">
                <div>
                  <code>{item.tool}</code> returned <strong>{item.rowCount}</strong>{' '}
                  {item.rowCount === 1 ? 'row' : 'rows'}
                  {item.note ? <span className="muted"> &middot; {item.note}</span> : null}
                </div>
                {item.sql && (
                  <details>
                    <summary>Show SQL</summary>
                    <pre>{item.sql}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {answer.rows.length > 0 && (
        <ResultTable rows={answer.rows} onOpenProperty={props.onOpenProperty} />
      )}

      {!notConfigured && (
        <p className="muted agent-meta" data-testid="agent-meta">
          Model {answer.model} &middot; {(answer.elapsedMs / 1000).toFixed(1)} s. Answers are built
          only from rows the tools returned.
        </p>
      )}
    </div>
  );
}

/** Natural-language questions over the same property data, with the evidence shown. */
export function AgentPanel(props: AgentPanelProps) {
  const { pin, radiusMiles } = props;
  const trpc = useTRPC();
  const inputId = useId();
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const ask = useMutation(trpc.agent.ask.mutationOptions());

  useEffect(() => {
    if (!ask.isPending || startedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, [ask.isPending, startedAt]);

  const trimmed = question.trim();
  const tooShort = trimmed.length < 3;

  const submit = (text: string): void => {
    const clean = text.trim();
    if (clean.length < 3 || ask.isPending) return;
    setAsked(clean);
    setStartedAt(Date.now());
    setElapsed(0);
    ask.mutate({ question: clean, ...(pin ? { center: pin, radiusMiles } : {}) });
  };

  return (
    <div className="agent" data-testid="agent-panel">
      <p className="muted agent-intro">
        Ask about roofing opportunities in plain English. The agent looks the answer up in the
        property and permit data and shows what it ran.
      </p>
      {props.agentModel === null && (
        <Notice kind="info" testId="agent-status-off">
          No language model is configured for this API, so questions get a fixed &ldquo;not
          configured&rdquo; reply. The map, filters and leads work without it.
        </Notice>
      )}

      <form
        className="agent-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(question);
        }}
      >
        <label htmlFor={inputId} className="field-label">
          Your question
        </label>
        <textarea
          id={inputId}
          rows={3}
          maxLength={MAX_QUESTION}
          value={question}
          placeholder="e.g. Show me open roofing permits older than five years within five miles of Chula Vista"
          data-testid="agent-input"
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(question);
          }}
        />
        <div className="agent-form-foot">
          <span className="muted" data-testid="agent-context">
            {pin
              ? `Sends your pin (${String(pin.lat)}, ${String(pin.lon)}) and ${String(radiusMiles)} mi radius for “near here”.`
              : 'No pin set: name a place in the question, or drop a pin first.'}
          </span>
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="agent-submit"
            disabled={tooShort || ask.isPending}
          >
            {ask.isPending ? 'Asking…' : 'Ask'}
          </button>
        </div>
      </form>

      <div className="agent-result" aria-live="polite">
        {asked && (
          <p className="agent-asked" data-testid="agent-asked">
            <span className="eyebrow">Question</span> {asked}
          </p>
        )}
        {ask.isPending && (
          <p className="agent-pending" role="status" data-testid="agent-pending">
            <span className="spinner" aria-hidden="true" /> Looking through the data&hellip;{' '}
            <span data-testid="agent-elapsed">{elapsed} s</span>
          </p>
        )}
        {ask.error && !ask.isPending && (
          <Notice
            kind="error"
            testId="agent-error"
            action={
              asked ? (
                <button
                  type="button"
                  className="btn btn-small"
                  data-testid="agent-retry"
                  onClick={() => {
                    submit(asked);
                  }}
                >
                  Try again
                </button>
              ) : undefined
            }
          >
            <strong>The agent could not answer.</strong> {describeError(ask.error)}
          </Notice>
        )}
        {ask.data && !ask.isPending && <Answer answer={ask.data} props={props} />}
      </div>

      <div className="examples">
        <span className="field-label" id={`${inputId}-examples`}>
          Try an example
        </span>
        <ul aria-labelledby={`${inputId}-examples`}>
          {EXAMPLE_QUESTIONS.map((example, index) => (
            <li key={example}>
              <button
                type="button"
                className="example"
                data-testid={`agent-example-${String(index)}`}
                disabled={ask.isPending}
                onClick={() => {
                  setQuestion(example);
                  submit(example);
                }}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
