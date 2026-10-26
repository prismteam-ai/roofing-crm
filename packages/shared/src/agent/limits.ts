// The agent turn's hard stop, shared by the API and the web app (ADR-06 §6.1,
// contracts/agent-api.md step 9). The API aborts the whole turn (plan + repair + compose) at this
// limit and returns a typed `timed_out` answer; the Ask screen states the same limit in its
// "stopped at the N s limit" copy. It sits inside the tRPC Lambda's 28 s timeout
// (infra/lib/crm-api-stack.ts), itself inside the HTTP API's 30 s limit; the infra test asserts
// that nesting against this constant. Browser-safe: a plain number, no imports.

/** Milliseconds a single agent turn may run before the server aborts it. */
export const AGENT_TURN_LIMIT_MS = 23_000;
