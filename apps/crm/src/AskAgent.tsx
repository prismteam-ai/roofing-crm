import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AnswerError,
  failureMessage,
  stoppedMessage,
  type AgentApi,
  type Conversation,
} from "./agent-api.ts";
import type {
  AgentCenter,
  AgentScreen,
  AnswerResponse,
} from "./agent-types.ts";
import { AgentAnswerView } from "./AgentAnswer.tsx";
import { coordText } from "./pin.ts";
import { createWarmup, HOLD_MAX_MS, type Warmup } from "./warmup.ts";

/** The notice under the question box. */
export const NOTICE =
  "Your question, the map center and the data the agent reads are sent to Anthropic to answer it.";

type Status = "idle" | "waking" | "working";

interface Turn {
  question: string;
  answer: AnswerResponse;
}

/** The center line under the box: what will be sent with the question. */
export function centerText(center: AgentCenter | undefined): string {
  return center
    ? `Center: ${center.label} (${coordText(center.lat)}, ${coordText(center.lon)})`
    : "Center: none yet. Drop a pin on the map or use your location, or name a place in the question.";
}

/** The screen's search values under the box: what is sent with the question beside the center. */
export function screenText(screen: AgentScreen): string {
  return `Radius: ${screen.radius_miles} mi. Roof older than: ${screen.threshold_years} years.`;
}

/**
 * The "Ask the agent" section of the aside. Collapsed at first; opening
 * it starts the warm-up. The body stays mounted while collapsed, so the conversation (history, session,
 * signature) lives in component state only, never in storage; "New conversation" drops it. The center is the
 * map pin as the App gives it, the screen its radius and last valid roof age threshold; both go with every
 * question. Send is disabled from the click until the answer, a stop or an error (a question asked during the
 * warm-up is held with a "waking up" status, Send disabled too); "New conversation" is disabled while a question
 * is pending.
 */
export function AskAgent({
  agent,
  warmData,
  center,
  screen,
  onOpenParcel,
  initiallyOpen = false,
}: {
  agent: AgentApi;
  /** One data API request (explorer.sources, about 0.8 s, so the two overlap), never batched with the other. */
  warmData: () => Promise<unknown>;
  /** The map pin ({lat, lon, label: "map pin" | "my location"}), if one is placed. */
  center: AgentCenter | undefined;
  /** The screen's radius and last valid roof age threshold (numbers only), sent with every question. */
  screen: AgentScreen;
  /** Opens a parcel's detail and pans the map to it (a parcel ID in Sources). */
  onOpenParcel: (parcelId: string) => void;
  initiallyOpen?: boolean;
}) {
  const [warmup] = useState<Warmup>(() =>
    createWarmup({ warmAgent: () => agent.warm(), warmData }),
  );
  const [open, setOpen] = useState(initiallyOpen);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const conversation = useRef<Conversation | undefined>(undefined);
  /** True from the click on Send until the answer, a stop or an error: Send and "New conversation" are disabled. */
  const [pending, setPending] = useState(false);
  /** The same, read synchronously in send (a second submit before the re-render sends nothing). */
  const pendingRef = useRef(false);
  /** The center and the screen at the time of Send (read in the async send). */
  const centerRef = useRef(center);
  const screenRef = useRef(screen);
  useEffect(() => {
    centerRef.current = center;
  }, [center]);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    if (open && !warmup.running() && warmup.stale()) void warmup.start();
  }, [open, warmup]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const asked = question;
    const q = asked.trim();
    if (!q) return setMessage("Type a question first.");
    if (pendingRef.current) return;
    const c = centerRef.current;
    const sc = screenRef.current;
    pendingRef.current = true;
    setPending(true);
    setMessage(undefined);
    try {
      // Re-warm: the data API instances may be cold again.
      if (!warmup.running() && warmup.stale()) void warmup.start();
      if (warmup.running()) {
        setStatus("waking");
        await warmup.hold();
      }
      setStatus("working");
      const conv = conversation.current;
      const res = await agent.answer({
        question: q,
        ...(c ? { center: { lat: c.lat, lon: c.lon, label: c.label } } : {}),
        screen: {
          radius_miles: sc.radius_miles,
          threshold_years: sc.threshold_years,
        },
        ...(conv
          ? {
              history: conv.history,
              session: conv.session,
              signature: conv.signature,
            }
          : {}),
      });
      if (res.status === "stopped") {
        setMessage(stoppedMessage(res));
        return;
      }
      // Answered or refused: a normal message; the conversation continues from what the server signed.
      conversation.current = {
        history: res.history,
        session: res.session,
        signature: res.signature,
      };
      setTurns((t) => [...t, { question: q, answer: res }]);
      setQuestion((cur) => (cur === asked ? "" : cur));
    } catch (err) {
      setMessage(
        err instanceof AnswerError
          ? err.message
          : failureMessage({ kind: "network" }),
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
      setStatus("idle");
    }
  };

  /** Disabled while a question is pending, so no answer can arrive for a dropped conversation. */
  const newConversation = () => {
    conversation.current = undefined;
    setTurns([]);
    setMessage(undefined);
    setStatus("idle");
  };

  return (
    <section className="ask-agent" data-testid="ask-agent">
      <h3>
        <button
          type="button"
          className="disclosure"
          data-testid="agent-open"
          aria-expanded={open}
          aria-controls="ask-agent-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▾" : "▸"} Ask the agent
        </button>
      </h3>
      <div id="ask-agent-body" hidden={!open} data-testid="agent-body">
        {turns.length > 0 && (
          <ol className="agent-turns" data-testid="agent-turns">
            {turns.map((t, i) => (
              <li key={i} data-testid="agent-turn">
                <p className="agent-question">
                  <b>You asked:</b> {t.question}
                </p>
                <AgentAnswerView
                  answer={t.answer}
                  onOpenParcel={onOpenParcel}
                />
              </li>
            ))}
          </ol>
        )}
        <form onSubmit={(e) => void send(e)} data-testid="agent-form">
          <label className="agent-box">
            {turns.length ? "Follow-up question" : "Question"}
            <textarea
              name="question"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which properties within one mile have roofs older than 15 years?"
            />
          </label>
          <p className="notice" data-testid="agent-request-line">
            <span data-testid="agent-center">{centerText(center)}</span>{" "}
            <span data-testid="agent-screen">{screenText(screen)}</span>
          </p>
          <p className="notice" data-testid="agent-notice">
            {NOTICE}
          </p>
          <div className="row">
            <button type="submit" data-testid="agent-send" disabled={pending}>
              Send
            </button>
            <button
              type="button"
              data-testid="agent-new"
              disabled={pending}
              onClick={newConversation}
            >
              New conversation
            </button>
          </div>
        </form>
        {status !== "idle" && (
          <p className="status" data-testid="agent-status" data-state={status}>
            {status === "waking"
              ? `Waking up the agent and the data API… your question is sent as soon as they answer (at most ${HOLD_MAX_MS / 1000} s).`
              : "Working on the answer… (usually 15–25 s)"}
          </p>
        )}
        {message && (
          <p className="error" data-testid="agent-message" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
