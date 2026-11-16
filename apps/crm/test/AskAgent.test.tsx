// @vitest-environment jsdom
/**
 * The aside's "Ask the agent" section, on jsdom with fake timers (Date
 * included). The agent API is the CRM's real client (createAgentApi) over a fake fetch: nothing leaves the
 * process, and no request ever reaches a real /agent/answer.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ANSWERED,
  CITED_PARCEL,
  DUMMY_SIGNATURE_1,
  FOLLOW_UP,
  QUESTION_1,
  QUESTION_2,
  REFUSED,
  STANDING_GAPS,
  STOPPED,
} from "../e2e/agent-fixtures.ts";
import { ANSWER_TIMEOUT_MS, createAgentApi } from "../src/agent-api.ts";
import type {
  AgentCenter,
  AgentScreen,
  AnswerResponse,
} from "../src/agent-types.ts";
import { AskAgent, NOTICE } from "../src/AskAgent.tsx";
import { Markdown } from "../src/markdown.tsx";
import { HOLD_MAX_MS, REWARM_AFTER_MS } from "../src/warmup.ts";

const AGENT_URL = "https://agent.test";

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Reply =
  | { status: number; body: unknown }
  | Promise<{ status: number; body: unknown }>
  | "hang";

/**
 * The fake agent API: /agent/warm answers 200 unless the test holds it; /agent/answer replies from the queue.
 * Every request is recorded (method, path, body, authorization).
 */
function fakeAgent() {
  const requests: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
    authorization?: string;
  }> = [];
  const answers: Reply[] = [];
  let warm: () => Promise<{ status: number; body: unknown }> = async () => ({
    status: 200,
    body: { status: "warm" },
  });
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      requests.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: headers.authorization,
      });
      expect(url.origin).toBe(AGENT_URL);
      let r: { status: number; body: unknown };
      if (url.pathname === "/agent/warm") r = await warm();
      else if (url.pathname === "/agent/answer") {
        const next = answers.shift();
        if (next === undefined) throw new Error("no answer queued");
        if (next === "hang")
          return new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          );
        r = await next;
      } else throw new Error(`unexpected ${url.pathname}`);
      return new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json" },
      });
    },
  );
  return {
    api: createAgentApi({ agentApiUrl: AGENT_URL, apiToken: "t", fetch }),
    requests,
    answers,
    answerRequests: () => requests.filter((r) => r.path === "/agent/answer"),
    warmRequests: () => requests.filter((r) => r.path === "/agent/warm"),
    holdWarm: (p: () => Promise<{ status: number; body: unknown }>) => {
      warm = p;
    },
    answerWith: (a: AnswerResponse) => answers.push({ status: 200, body: a }),
  };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let agent: ReturnType<typeof fakeAgent>;
let warmData: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
let onOpenParcel: ReturnType<typeof vi.fn<(id: string) => void>>;
const PIN: AgentCenter = { lat: 34.199, lon: -118.487, label: "map pin" };
const SCREEN: AgentScreen = { radius_miles: 1, threshold_years: 15 };

/** The section, open (as after a click on its heading) unless `open` is false; `center` null: no pin. */
function renderTab(
  open = true,
  center: AgentCenter | null = PIN,
  screenValues: AgentScreen = SCREEN,
) {
  return render(
    <AskAgent
      agent={agent.api}
      warmData={warmData}
      center={center ?? undefined}
      screen={screenValues}
      onOpenParcel={onOpenParcel}
      initiallyOpen={open}
    />,
  );
}
const box = () =>
  screen.getByRole("textbox", { name: /question/i }) as HTMLTextAreaElement;
const send = () => screen.getByTestId("agent-send") as HTMLButtonElement;
const newConv = () => screen.getByTestId("agent-new") as HTMLButtonElement;
async function ask(q: string) {
  fireEvent.change(box(), { target: { value: q } });
  fireEvent.click(send());
  await flush();
}
/** Opens the tab and lets the warm-up answer. */
async function openWarm() {
  const r = renderTab();
  await flush();
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
  agent = fakeAgent();
  warmData = vi.fn(async () => ({ api_version: "test" }));
  onOpenParcel = vi.fn<(id: string) => void>();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Ask the agent: warm-up and held questions", () => {
  test("opening the section sends GET /agent/warm and two data API requests at once, with the CRM's token", async () => {
    const data = [deferred<unknown>(), deferred<unknown>()];
    warmData.mockImplementation(
      () => data[warmData.mock.calls.length - 1]!.promise,
    );
    const w = deferred<{ status: number; body: unknown }>();
    agent.holdWarm(() => w.promise);
    renderTab();
    // All three are out before any has answered.
    expect(warmData).toHaveBeenCalledTimes(2);
    expect(agent.warmRequests()).toEqual([
      {
        method: "GET",
        path: "/agent/warm",
        body: undefined,
        authorization: "Bearer t",
      },
    ]);
    data[0]!.resolve({});
    data[1]!.resolve({});
    w.resolve({ status: 200, body: { status: "warm" } });
    await flush();
    expect(agent.answerRequests()).toEqual([]);
  });

  test("a collapsed section does not warm up; opening it does, and closing and reopening it within 4 minutes does not warm again", async () => {
    renderTab(false);
    await flush();
    expect(warmData).not.toHaveBeenCalled();
    expect(agent.warmRequests()).toHaveLength(0);
    const toggle = screen.getByTestId("agent-open");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect((screen.getByTestId("agent-body") as HTMLElement).hidden).toBe(true);
    fireEvent.click(toggle);
    await flush();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByTestId("agent-body") as HTMLElement).hidden).toBe(
      false,
    );
    expect(warmData).toHaveBeenCalledTimes(2);
    expect(agent.warmRequests()).toHaveLength(1);
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await flush();
    expect(warmData).toHaveBeenCalledTimes(2);
    expect(agent.warmRequests()).toHaveLength(1);
  });

  test("a question asked before both warm-ups answered is held with a visible waking-up status and sent when both answer", async () => {
    const data = [deferred<unknown>(), deferred<unknown>()];
    warmData.mockImplementation(
      () => data[warmData.mock.calls.length - 1]!.promise,
    );
    const w = deferred<{ status: number; body: unknown }>();
    agent.holdWarm(() => w.promise);
    agent.answerWith(ANSWERED);
    renderTab();
    await ask(QUESTION_1);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("waking");
    expect(screen.getByTestId("agent-status").textContent).toMatch(
      /waking up/i,
    );
    expect(send().disabled).toBe(true);
    w.resolve({ status: 200, body: { status: "warm" } });
    data[0]!.resolve({});
    await flush();
    // The agent and one data request answered: still held.
    expect(agent.answerRequests()).toHaveLength(0);
    data[1]!.resolve({});
    await flush();
    expect(agent.answerRequests()).toHaveLength(1);
    expect(agent.answerRequests()[0]!.body).toEqual({
      question: QUESTION_1,
      center: PIN,
      screen: SCREEN,
    });
    expect(screen.getByTestId("agent-answer").dataset.status).toBe("answered");
    expect(send().disabled).toBe(false);
  });

  test("a held question is sent after 20 s when the warm-ups have not answered", async () => {
    warmData.mockImplementation(() => new Promise(() => {}));
    agent.holdWarm(() => new Promise(() => {}));
    agent.answerWith(ANSWERED);
    renderTab();
    await ask(QUESTION_1);
    await wait(HOLD_MAX_MS - 1);
    expect(agent.answerRequests()).toHaveLength(0);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("waking");
    await wait(1);
    expect(agent.answerRequests()).toHaveLength(1);
  });

  test("a warm-up that failed still releases the question (any answer counts) and leaves the data warm-up stale", async () => {
    warmData.mockRejectedValue(new Error("HTTP 503"));
    agent.holdWarm(async () => ({
      status: 503,
      body: { error: "agent not configured" },
    }));
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    await openWarm();
    await ask(QUESTION_1);
    expect(agent.answerRequests()).toHaveLength(1);
    // No data API response yet: the next question warms up again first.
    await ask(QUESTION_2);
    expect(agent.warmRequests()).toHaveLength(3);
    expect(warmData).toHaveBeenCalledTimes(6);
  });

  test("re-warm: a question sent more than 4 minutes after the last data API response runs the warm-up again and is held the same way", async () => {
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    await openWarm();
    expect(warmData).toHaveBeenCalledTimes(2);
    // Within 4 minutes: sent at once, no warm-up.
    await wait(REWARM_AFTER_MS - 1_000);
    await ask(QUESTION_1);
    expect(agent.answerRequests()).toHaveLength(1);
    expect(warmData).toHaveBeenCalledTimes(2);
    expect(agent.warmRequests()).toHaveLength(1);
    // Past 4 minutes since the last data response: warm-up again, the question held until it answers.
    await wait(2_000);
    const data = [deferred<unknown>(), deferred<unknown>()];
    warmData.mockImplementation(
      () => data[warmData.mock.calls.length - 3]!.promise,
    );
    await ask(QUESTION_2);
    expect(warmData).toHaveBeenCalledTimes(4);
    expect(agent.warmRequests()).toHaveLength(2);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("waking");
    expect(agent.answerRequests()).toHaveLength(1);
    data[0]!.resolve({});
    data[1]!.resolve({});
    await flush();
    expect(agent.answerRequests()).toHaveLength(2);
  });

  test("re-warm hold also ends at 20 s", async () => {
    agent.answerWith(ANSWERED);
    await openWarm();
    await wait(REWARM_AFTER_MS + 1);
    warmData.mockImplementation(() => new Promise(() => {}));
    await ask(QUESTION_1);
    expect(warmData).toHaveBeenCalledTimes(4);
    await wait(HOLD_MAX_MS - 1);
    expect(agent.answerRequests()).toHaveLength(0);
    await wait(1);
    expect(agent.answerRequests()).toHaveLength(1);
  });
});

describe("Ask the agent: sending and statuses", () => {
  test("the notice under the box says the question, the map center and the data are sent to Anthropic (revision 2 wording)", async () => {
    await openWarm();
    expect(screen.getByTestId("agent-notice").textContent).toBe(NOTICE);
    expect(NOTICE).toBe(
      "Your question, the map center and the data the agent reads are sent to Anthropic to answer it.",
    );
  });

  test("Send and New conversation are disabled from the click (warm-up hold included) until the answer, a stop or an error; enabled whenever no question is pending", async () => {
    const w = deferred<{ status: number; body: unknown }>();
    agent.holdWarm(() => w.promise);
    const a = deferred<{ status: number; body: unknown }>();
    const stop = deferred<{ status: number; body: unknown }>();
    const fail = deferred<{ status: number; body: unknown }>();
    agent.answers.push(a.promise, stop.promise, fail.promise);
    renderTab();
    expect([send().disabled, newConv().disabled]).toEqual([false, false]);
    await ask(QUESTION_1);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("waking");
    expect([send().disabled, newConv().disabled]).toEqual([true, true]);
    w.resolve({ status: 200, body: {} });
    await flush();
    expect(screen.getByTestId("agent-status").dataset.state).toBe("working");
    expect([send().disabled, newConv().disabled]).toEqual([true, true]);
    a.resolve({ status: 200, body: ANSWERED });
    await flush();
    expect([send().disabled, newConv().disabled]).toEqual([false, false]);
    // A stop.
    await ask(QUESTION_2);
    expect([send().disabled, newConv().disabled]).toEqual([true, true]);
    stop.resolve({ status: 200, body: STOPPED });
    await flush();
    expect(screen.getByTestId("agent-message").textContent).toMatch(/stopped/);
    expect([send().disabled, newConv().disabled]).toEqual([false, false]);
    // An error.
    await ask(QUESTION_2);
    expect([send().disabled, newConv().disabled]).toEqual([true, true]);
    fail.resolve({ status: 500, body: { error: "internal error" } });
    await flush();
    expect(screen.getByTestId("agent-message").textContent).toMatch(/HTTP 500/);
    expect([send().disabled, newConv().disabled]).toEqual([false, false]);
  });

  test("while waiting for the answer a working status shows; it goes when the answer is in", async () => {
    const a = deferred<{ status: number; body: unknown }>();
    agent.answers.push(a.promise);
    await openWarm();
    await ask(QUESTION_1);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("working");
    expect(screen.getByTestId("agent-status").textContent).toMatch(/working/i);
    a.resolve({ status: 200, body: ANSWERED });
    await flush();
    expect(screen.queryByTestId("agent-status")).toBeNull();
    expect(box().value).toBe("");
  });

  test("a second submit while an answer is pending sends nothing and shows no message; the new question stays in the box", async () => {
    const a = deferred<{ status: number; body: unknown }>();
    agent.answers.push(a.promise);
    await openWarm();
    await ask(QUESTION_1);
    expect(send().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: QUESTION_2 } });
    fireEvent.submit(screen.getByTestId("agent-form"));
    await flush();
    expect(agent.answerRequests()).toHaveLength(1);
    expect(screen.queryByTestId("agent-message")).toBeNull();
    expect(box().value).toBe(QUESTION_2);
    a.resolve({ status: 200, body: ANSWERED });
    await flush();
    // The box kept the newer question.
    expect(box().value).toBe(QUESTION_2);
  });

  test("a stopped answer shows a plain message and keeps the question; the conversation is unchanged", async () => {
    agent.answerWith(STOPPED);
    agent.answerWith(ANSWERED);
    await openWarm();
    await ask(QUESTION_1);
    const msg = screen.getByTestId("agent-message").textContent!;
    expect(msg).toContain("stopped before it was complete (time_budget)");
    expect(msg).toContain(STOPPED.text);
    expect(box().value).toBe(QUESTION_1);
    expect(screen.queryByTestId("agent-answer")).toBeNull();
    // Sent again: no history from the stopped answer.
    fireEvent.click(send());
    await flush();
    expect(agent.answerRequests()[1]!.body).toEqual({
      question: QUESTION_1,
      center: PIN,
      screen: SCREEN,
    });
    expect(screen.queryByTestId("agent-message")).toBeNull();
  });

  test.each([
    [
      500,
      { error: "internal error" },
      /not available right now \(HTTP 500: internal error\)/,
    ],
    [
      503,
      { error: "agent not configured" },
      /not available right now \(HTTP 503: agent not configured\)/,
    ],
    [
      502,
      { message: "Internal Server Error" },
      /not available right now \(HTTP 502/,
    ],
    [
      504,
      { message: "Gateway Timeout" },
      /did not answer in time \(gateway timeout, HTTP 504\)/,
    ],
  ])(
    "HTTP %i shows a plain message and keeps the question in the box",
    async (status, body, re) => {
      agent.answers.push({ status, body });
      await openWarm();
      await ask(QUESTION_1);
      expect(screen.getByTestId("agent-message").textContent).toMatch(re);
      expect(screen.getByTestId("agent-message").textContent).toContain(
        "Your question is still in the box",
      );
      expect(box().value).toBe(QUESTION_1);
      expect(screen.queryByTestId("agent-answer")).toBeNull();
      expect(screen.queryByTestId("agent-status")).toBeNull();
    },
  );

  test("no answer within the client timeout is a gateway timeout; the question stays", async () => {
    agent.answers.push("hang");
    await openWarm();
    await ask(QUESTION_1);
    await wait(ANSWER_TIMEOUT_MS - 1);
    expect(screen.getByTestId("agent-status").dataset.state).toBe("working");
    await wait(1);
    expect(screen.getByTestId("agent-message").textContent).toMatch(
      /did not answer in time \(gateway timeout\)/,
    );
    expect(box().value).toBe(QUESTION_1);
  });

  test("a refused answer is shown as a normal message, not an error", async () => {
    agent.answerWith(REFUSED);
    await openWarm();
    await ask("Who owns 2218022020?");
    const a = screen.getByTestId("agent-answer");
    expect(a.dataset.status).toBe("refused");
    expect(a.closest(".error")).toBeNull();
    expect(screen.getByTestId("agent-text").textContent).toBe(REFUSED.text);
    expect(screen.queryByTestId("agent-message")).toBeNull();
    expect(box().value).toBe("");
    // Gaps stay visible on a refusal.
    expect(
      within(a).getByTestId("agent-standing-gaps").querySelectorAll("li"),
    ).toHaveLength(STANDING_GAPS.length);
  });

  test("the pin is sent as the center with its label, and shown under the box", async () => {
    agent.answerWith(ANSWERED);
    await openWarm();
    expect(screen.getByTestId("agent-center").textContent).toBe(
      "Center: map pin (34.199000, -118.487000)",
    );
    await ask("Roofs older than 20 years within 2 miles?");
    expect(agent.answerRequests()[0]!.body).toEqual({
      question: "Roofs older than 20 years within 2 miles?",
      center: { lat: 34.199, lon: -118.487, label: "map pin" },
      screen: SCREEN,
    });
  });

  test("a pin placed by GPS goes as 'my location'; the center sent is the pin at the time of Send", async () => {
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    const r = renderTab(true, { lat: 34.1, lon: -118.3, label: "my location" });
    await flush();
    expect(screen.getByTestId("agent-center").textContent).toBe(
      "Center: my location (34.100000, -118.300000)",
    );
    await ask(QUESTION_1);
    expect(agent.answerRequests()[0]!.body).toMatchObject({
      center: { lat: 34.1, lon: -118.3, label: "my location" },
    });
    r.rerender(
      <AskAgent
        agent={agent.api}
        warmData={warmData}
        center={PIN}
        screen={SCREEN}
        onOpenParcel={onOpenParcel}
        initiallyOpen
      />,
    );
    await ask(QUESTION_2);
    expect(agent.answerRequests()[1]!.body).toMatchObject({ center: PIN });
  });

  test("the screen's radius and threshold show under the box beside the center and go with every question, as numbers, the values at the time of Send", async () => {
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    const r = renderTab(true, PIN, { radius_miles: 0.25, threshold_years: 30 });
    await flush();
    expect(screen.getByTestId("agent-request-line").textContent).toBe(
      "Center: map pin (34.199000, -118.487000) Radius: 0.25 mi. Roof older than: 30 years.",
    );
    await ask(QUESTION_1);
    expect(agent.answerRequests()[0]!.body).toMatchObject({
      screen: { radius_miles: 0.25, threshold_years: 30 },
    });
    r.rerender(
      <AskAgent
        agent={agent.api}
        warmData={warmData}
        center={PIN}
        screen={{ radius_miles: 10, threshold_years: 120 }}
        onOpenParcel={onOpenParcel}
        initiallyOpen
      />,
    );
    expect(screen.getByTestId("agent-screen").textContent).toBe(
      "Radius: 10 mi. Roof older than: 120 years.",
    );
    await ask(QUESTION_2);
    const sent = agent.answerRequests()[1]!.body!;
    expect(sent.screen).toEqual({ radius_miles: 10, threshold_years: 120 });
    expect(Object.keys(sent.screen as object)).toEqual([
      "radius_miles",
      "threshold_years",
    ]);
  });

  test("without a pin no center is sent, and the line under the box says how to set one", async () => {
    agent.answerWith(ANSWERED);
    renderTab(true, null);
    await flush();
    expect(screen.getByTestId("agent-center").textContent).toMatch(
      /^Center: none yet\. Drop a pin on the map or use your location, or name a place in the question\.$/,
    );
    await ask(QUESTION_1);
    expect(agent.answerRequests()[0]!.body).toEqual({
      question: QUESTION_1,
      screen: SCREEN,
    });
  });
});

describe("Ask the agent: conversation", () => {
  test("a follow-up sends the history, session and signature of the previous answer, from component state only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    await openWarm();
    await ask(QUESTION_1);
    expect(
      screen.getByRole("textbox", { name: /follow-up question/i }),
    ).toBeTruthy();
    await ask(QUESTION_2);
    expect(agent.answerRequests()[1]!.body).toEqual({
      question: QUESTION_2,
      center: PIN,
      screen: SCREEN,
      history: ANSWERED.history,
      session: ANSWERED.session,
      signature: DUMMY_SIGNATURE_1,
    });
    expect(screen.getAllByTestId("agent-turn")).toHaveLength(2);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    setItem.mockRestore();
  });

  test("a refused answer continues the conversation from what the server signed", async () => {
    agent.answerWith(ANSWERED);
    agent.answerWith({
      ...REFUSED,
      history: ANSWERED.history,
      session: ANSWERED.session,
      signature: "sig-r",
    });
    agent.answerWith(FOLLOW_UP);
    await openWarm();
    await ask(QUESTION_1);
    await ask("Who owns it?");
    await ask(QUESTION_2);
    expect(agent.answerRequests()[2]!.body).toMatchObject({
      signature: "sig-r",
      history: ANSWERED.history,
    });
  });

  test("New conversation clears the answers and the next question goes without history", async () => {
    agent.answerWith(ANSWERED);
    agent.answerWith(FOLLOW_UP);
    await openWarm();
    await ask(QUESTION_1);
    fireEvent.click(screen.getByTestId("agent-new"));
    expect(screen.queryByTestId("agent-turn")).toBeNull();
    await ask(QUESTION_2);
    expect(agent.answerRequests()[1]!.body).toEqual({
      question: QUESTION_2,
      center: PIN,
      screen: SCREEN,
    });
  });

  test("New conversation cannot drop a pending question: it is disabled until the answer is in", async () => {
    const a = deferred<{ status: number; body: unknown }>();
    agent.answers.push(a.promise);
    await openWarm();
    await ask(QUESTION_1);
    expect(newConv().disabled).toBe(true);
    fireEvent.click(newConv());
    a.resolve({ status: 200, body: ANSWERED });
    await flush();
    expect(screen.getAllByTestId("agent-turn")).toHaveLength(1);
    expect(newConv().disabled).toBe(false);
    fireEvent.click(newConv());
    expect(screen.queryByTestId("agent-turn")).toBeNull();
  });
});

describe("Ask the agent: rendering", () => {
  test("text as markdown, How I got this collapsed, Sources by kind, Gaps answer-first then Always true, unverified IDs flagged", async () => {
    agent.answerWith(ANSWERED);
    await openWarm();
    await ask(QUESTION_1);
    const a = screen.getByTestId("agent-answer");
    const text = within(a).getByTestId("agent-text");
    expect(text.querySelector("strong")!.textContent).toBe(
      "115,373 parcels within 5 miles of Van Nuys have roofs older than 15 years.",
    );
    expect(
      [...text.querySelectorAll("tbody tr")].map((r) => r.textContent),
    ).toEqual(["22180220202002PERMIT", "22180220392006PROXY"]);
    // Unverified IDs flagged where they appear, and listed.
    const marks = within(a).getAllByTestId("unverified-id");
    expect(marks.map((m) => m.textContent)).toEqual([
      "2218099999 (unverified)",
    ]);
    expect(within(a).getByTestId("agent-unverified").textContent).toContain(
      "2218099999",
    );
    // How I got this: collapsed, with reasoning and assumptions.
    const how = within(a).getByTestId("agent-how") as HTMLDetailsElement;
    expect(how.open).toBe(false);
    expect(how.querySelector("summary")!.textContent).toBe("How I got this");
    expect(how.textContent).toContain(ANSWERED.reasoning);
    expect(how.textContent).toContain(ANSWERED.assumptions[0]);
    // Sources grouped by kind, each row ID, source, license, attribution, collected at.
    const tables = within(a).getAllByTestId("agent-sources");
    expect(tables.map((t) => t.dataset.kind)).toEqual([
      "parcel",
      "permit",
      "contractor",
    ]);
    expect(
      [...tables[0]!.querySelectorAll("th")].map((th) => th.textContent),
    ).toEqual(["ID", "Source", "License", "Attribution", "Collected at"]);
    const cells = (t: HTMLElement) =>
      [...t.querySelectorAll("tbody td")].map((td) => td.textContent);
    // Each cell names its column (the label shown when the narrow aside stacks a record; styles.css).
    for (const t of tables) {
      expect(t.classList.contains("agent-sources")).toBe(true);
      for (const tr of t.querySelectorAll("tbody tr"))
        expect(
          [...tr.querySelectorAll("td")].map((td) => td.dataset.label),
        ).toEqual(["ID", "Source", "License", "Attribution", "Collected at"]);
    }
    const [parcel, permit] = ANSWERED.records;
    expect(cells(tables[0]!)).toEqual([
      parcel!.id,
      parcel!.source_name,
      "—",
      "—",
      parcel!.collected_at,
    ]);
    expect(cells(tables[1]!)).toEqual([
      permit!.id,
      permit!.source_name,
      permit!.license,
      permit!.attribution,
      permit!.collected_at,
    ]);
    // Gaps: this answer's first, the standing ones under "Always true".
    expect(
      [...within(a).getByTestId("agent-gaps").querySelectorAll("li")].map(
        (l) => l.textContent,
      ),
    ).toEqual(ANSWERED.gaps.slice(STANDING_GAPS.length));
    expect(
      [
        ...within(a).getByTestId("agent-standing-gaps").querySelectorAll("li"),
      ].map((l) => l.textContent),
    ).toEqual(STANDING_GAPS);
    expect(within(a).getByText("Always true")).toBeTruthy();
  });

  test("a parcel ID in Sources is a button that opens that parcel (detail and map pan); permit IDs are plain text", async () => {
    agent.answerWith(ANSWERED);
    await openWarm();
    await ask(QUESTION_1);
    const links = screen.getAllByTestId("agent-parcel-link");
    expect(links.map((l) => l.textContent)).toEqual([CITED_PARCEL]);
    expect(links[0]!.closest("table")!.dataset.kind).toBe("parcel");
    fireEvent.click(links[0]!);
    expect(onOpenParcel).toHaveBeenCalledExactlyOnceWith(CITED_PARCEL);
    for (const kind of ["permit", "contractor"])
      expect(
        screen
          .getAllByTestId("agent-sources")
          .find((t) => t.dataset.kind === kind)!
          .querySelector("button"),
      ).toBeNull();
  });

  test("markdown is rendered without raw HTML; only http(s) links become links", () => {
    const { container } = render(
      <Markdown
        text={
          '# Head\n\nA <b>bold</b> <img src=x onerror="alert(1)"> and <script>alert(1)</script>.\n\n- [ok](https://example.com) and [bad](javascript:alert(1))\n- `code`'
        }
      />,
    );
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    const links = [...container.querySelectorAll("a")];
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "https://example.com",
    ]);
    expect(container.textContent).toContain("[bad](javascript:alert(1))");
    expect(container.querySelector("h3")!.textContent).toBe("Head");
    expect(container.querySelector("code")!.textContent).toBe("code");
  });
});
