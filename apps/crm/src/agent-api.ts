/**
 * The CRM's client for the hosted agent API (OracleLaAgentApi, the pipeline's apps/agent-api):
 * - POST <agentApiUrl>/agent/answer with { question, center?, screen?, history?, session?, signature? }; 200 is the
 *   agent's answer plus `signature` (the server's MAC of the returned { history, session }).
 * - GET <agentApiUrl>/agent/warm: initializes the function (configuration, both parameters), no model call.
 * Both carry the CRM's own bearer token (the shared token authorizer; the agent serves crm and explorer).
 * Adapted from the Explorer's panel client (pipeline 6200575); the types are declared in agent-types.ts.
 */
import type {
  AgentAnswer,
  AgentCenter,
  AnswerRequest,
  AnswerResponse,
  Citation,
  SessionState,
} from "./agent-types.ts";

export type {
  AgentAnswer,
  AgentCenter,
  AnswerRequest,
  AnswerResponse,
  Citation,
  SessionState,
};

/** The conversation the panel holds between questions (component state only, never stored). */
export interface Conversation {
  history: AgentAnswer["history"];
  session: SessionState;
  signature: string;
}

/**
 * Longest the panel waits for an answer. The agent's Lambda has 29 s and API Gateway cuts the integration at 30 s
 * (then answers 503/504 itself); past this the browser gives up and reports a gateway timeout.
 */
export const ANSWER_TIMEOUT_MS = 35_000;

/** Why an answer request produced no answer. */
export type AnswerFailure =
  | { kind: "timeout"; status?: number }
  | { kind: "server"; status: number; error?: string }
  | { kind: "client"; status: number; error?: string }
  | { kind: "network" };

export class AnswerError extends Error {
  readonly failure: AnswerFailure;
  constructor(failure: AnswerFailure) {
    super(failureMessage(failure));
    this.name = "AnswerError";
    this.failure = failure;
  }
}

/** The plain message the panel shows for a request that produced no answer (the question stays in the box). */
export function failureMessage(f: AnswerFailure): string {
  const keep = "Your question is still in the box: send it again.";
  switch (f.kind) {
    case "timeout":
      return `The agent did not answer in time (gateway timeout${f.status ? `, HTTP ${f.status}` : ""}). ${keep}`;
    case "server":
      return `The agent is not available right now (HTTP ${f.status}${f.error ? `: ${f.error}` : ""}). ${keep}`;
    case "client":
      return `The agent refused the request (HTTP ${f.status}${f.error ? `: ${f.error}` : ""}). ${keep}`;
    case "network":
      return `The agent could not be reached (network error). ${keep}`;
  }
}

/** The plain message for a stopped answer (the question stays in the box; the conversation is not changed). */
export function stoppedMessage(a: Pick<AgentAnswer, "stopped_by" | "text">) {
  return `The answer stopped before it was complete (${a.stopped_by ?? "unknown"}): ${a.text} Your question is still in the box: send it again.`;
}

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface AgentApi {
  /** GET /agent/warm; resolves with the HTTP status (any response counts as answered), rejects on a network error. */
  warm: () => Promise<number>;
  /** POST /agent/answer; rejects with AnswerError when no answer came back. */
  answer: (body: AnswerRequest) => Promise<AnswerResponse>;
}

const errorText = async (res: Response): Promise<string | undefined> => {
  try {
    const b = (await res.json()) as { error?: unknown; message?: unknown };
    const e = b.error ?? b.message;
    return typeof e === "string" ? e : undefined;
  } catch {
    return undefined;
  }
};

export function createAgentApi(opts: {
  agentApiUrl: string;
  apiToken: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): AgentApi {
  const f: Fetch = opts.fetch ?? ((i, init) => globalThis.fetch(i, init));
  const url = (path: string) => new URL(path, opts.agentApiUrl).toString();
  const authorization = `Bearer ${opts.apiToken}`;
  return {
    async warm() {
      const res = await f(url("/agent/warm"), {
        method: "GET",
        headers: { authorization },
        cache: "no-store",
      });
      return res.status;
    },
    async answer(body) {
      const ctl = new AbortController();
      const timer = setTimeout(
        () => ctl.abort(),
        opts.timeoutMs ?? ANSWER_TIMEOUT_MS,
      );
      let res: Response;
      try {
        res = await f(url("/agent/answer"), {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: ctl.signal,
          cache: "no-store",
        });
        if (res.ok) return (await res.json()) as AnswerResponse;
      } catch {
        throw new AnswerError(
          ctl.signal.aborted ? { kind: "timeout" } : { kind: "network" },
        );
      } finally {
        clearTimeout(timer);
      }
      const error = await errorText(res);
      if (res.status === 504)
        throw new AnswerError({ kind: "timeout", status: 504 });
      if (res.status >= 500)
        throw new AnswerError({ kind: "server", status: res.status, error });
      throw new AnswerError({ kind: "client", status: res.status, error });
    },
  };
}
