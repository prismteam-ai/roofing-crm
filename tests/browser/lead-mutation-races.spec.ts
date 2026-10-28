import {
  test,
  expect,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";
import {
  CONTRACT_VERSION,
  LeadSchema,
  LeadUpdateSchema,
  PropertySchema,
  type Lead,
} from "../../packages/contracts/src/index";

// Entirely synthetic: this suite never reaches a backend or external origin.
const snapshotId = "demo-oakland-v1";
const property = PropertySchema.parse({
  id: "SYN-MUTATION-A",
  nativeId: "SYN-MUTATION-A",
  address: "Synthetic mutation regression property",
  parcelIds: [],
  usage: "unknown",
  coordinates: { lat: 42.66, lng: -83.29 },
  roof: {
    ageYears: null,
    basis: "unknown",
    confidence: "unknown",
    asOf: "2026-10-28",
    caveats: ["Synthetic regression only"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [
    {
      sourceId: "synthetic-mutation-regression",
      recordId: "SYN-MUTATION-A",
      observedAt: "2026-10-28T00:00:00.000Z",
      digest: "synthetic-only",
      kind: "synthetic",
    },
  ],
});
function lead(sessionId = "synthetic-session-A", version = 1): Lead {
  return LeadSchema.parse({
    id: "synthetic-mutation-lead",
    sessionId,
    propertyId: property.id,
    snapshotId,
    status: "new",
    version,
    events: [{ kind: "created", at: "2026-10-28T00:00:00.000Z" }],
  });
}
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function fixture(page: Page, options: { saved?: boolean } = {}) {
  const errors: string[] = [],
    external: string[] = [],
    unexpected: string[] = [];
  const mutations: Array<{
    method: string;
    expectedVersion?: number;
    status?: string;
    note?: string;
    response?: number;
  }> = [];
  let sessionId = "synthetic-session-A";
  let current: Lead | undefined = options.saved === false ? undefined : lead();
  const defaultMutation = async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const record = { method: "POST", response: 200 };
      mutations.push(record);
      current ??= lead(sessionId);
      await route.fulfill({ json: current });
      return;
    }
    const body = LeadUpdateSchema.parse(request.postDataJSON());
    const record = {
      method: "PATCH",
      expectedVersion: body.expectedVersion,
      status: body.status,
      note: body.note,
      response: 200,
    };
    mutations.push(record);
    if (!current || body.expectedVersion !== current.version) {
      record.response = 409;
      await route.fulfill({
        status: 409,
        json: { message: "Synthetic stale version" },
      });
      return;
    }
    current = LeadSchema.parse({
      ...current,
      status: body.status ?? current.status,
      version: current.version + 1,
      events: [
        ...current.events,
        {
          kind: body.status ? `status:${body.status}` : "note",
          at: "2026-10-28T00:00:01.000Z",
          ...(body.note === undefined ? {} : { note: body.note }),
        },
      ],
    });
    await route.fulfill({ json: current });
  };
  let mutate: (route: Route) => Promise<void> = defaultMutation;
  let read: (route: Route) => Promise<void> = (route) =>
    route.fulfill({ json: current ? [current] : [] });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:4174" ||
      ["blob:", "data:"].includes(url.protocol)
    )
      return route.continue();
    external.push(url.origin);
    await route.abort();
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      method = route.request().method();
    if (url.origin !== "http://127.0.0.1:4174") {
      external.push(url.origin);
      await route.abort();
      return;
    }
    if (url.pathname === "/api/health")
      return route.fulfill({
        json: {
          contractVersion: CONTRACT_VERSION,
          snapshotId,
          mode: "synthetic",
          digest: "synthetic-only",
          accessMode: "review-session",
          provider: "deterministic-offline",
        },
      });
    if (url.pathname === "/api/session") {
      if (method === "DELETE")
        return route.fulfill({ json: { session: null } });
      if (method === "POST") {
        sessionId = "synthetic-session-B";
        current = lead(sessionId, 7);
      }
      return route.fulfill({ json: { session: { id: sessionId } } });
    }
    if (url.pathname === "/api/map-config")
      return route.fulfill({ json: { kind: "offline" } });
    if (url.pathname === "/api/search")
      return route.fulfill({
        json: {
          contractVersion: CONTRACT_VERSION,
          snapshotId,
          queryHash: "a".repeat(64),
          rows: [{ ...property, distanceMeters: 0 }],
          total: 1,
          truncated: false,
          nextCursor: null,
          limitations: ["Synthetic regression only"],
        },
      });
    if (url.pathname === "/api/leads" && method === "GET") return read(route);
    if (
      (url.pathname === "/api/leads" && method === "POST") ||
      (url.pathname.startsWith("/api/leads/") && method === "PATCH")
    )
      return mutate(route);
    if (url.pathname.startsWith("/api/properties/"))
      return route.fulfill({ json: property });
    unexpected.push(`${method} ${url.pathname}`);
    await route.fulfill({
      status: 501,
      json: { message: "Unexpected synthetic route" },
    });
  });
  await page.goto("/");
  await expect(page.getByTestId("property-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Leads/ })).toContainText(
    options.saved === false ? "0" : "1",
  );
  await page.getByTestId("property-row").click();
  await expect(page.getByTestId("property-detail")).toBeVisible();
  return {
    errors,
    external,
    unexpected,
    mutations,
    setMutation: (handler: typeof mutate) => {
      mutate = handler;
    },
    setRead: (handler: typeof read) => {
      read = handler;
    },
    mutate: defaultMutation,
    current: () => current,
    setCurrent: (value: Lead | undefined) => {
      current = value;
    },
  };
}

test("status pending blocks a rapid note save and preserves its draft", async ({
  page,
}, testInfo: TestInfo) => {
  const state = await fixture(page),
    gate = barrier();
  let first = true;
  await page.route("**/api/leads/*", async (route) => {
    const body = LeadUpdateSchema.parse(route.request().postDataJSON());
    const record = {
      method: "PATCH",
      expectedVersion: body.expectedVersion,
      status: body.status,
      note: body.note,
      response: 200,
    };
    state.mutations.push(record);
    if (!first) {
      record.response = 409;
      await route.fulfill({
        status: 409,
        json: { message: "Synthetic stale version" },
      });
      return;
    }
    first = false;
    state.setCurrent({
      ...lead(),
      status: "qualified",
      version: 2,
      events: [
        ...lead().events,
        { kind: "status:qualified", at: "2026-10-28T00:00:01.000Z" },
      ],
    });
    await gate.promise;
    await route.fulfill({ json: state.current() });
  });
  const note = page.getByLabel("Lead note", { exact: true });
  await note.fill("Synthetic unsaved draft");
  await page
    .getByLabel("Lead status", { exact: true })
    .selectOption("qualified");
  await expect.poll(() => state.mutations.length).toBe(1);
  const pending = {
    statusDisabled: await page
      .getByLabel("Lead status", { exact: true })
      .isDisabled(),
    saveDisabled: await page
      .getByRole("button", { name: "Save note", exact: true })
      .isDisabled(),
  };
  await page
    .getByRole("button", { name: "Save note", exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await settle(page);
  gate.release();
  await expect(page.getByRole("status")).toContainText("Lead updated.");
  await settle(page);
  await testInfo.attach("synthetic-race-observation", {
    contentType: "application/json",
    body: JSON.stringify({
      pending,
      mutations: state.mutations,
      draft: await note.inputValue(),
      errors: state.errors,
      external: state.external,
      unexpected: state.unexpected,
    }),
  });
  expect(state.mutations).toHaveLength(1);
  expect(pending).toEqual({ statusDisabled: true, saveDisabled: true });
  await expect(note).toHaveValue("Synthetic unsaved draft");
  await expect(page.getByTestId("property-detail")).toContainText(
    "Saved as a lead · version 2",
  );
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.unexpected).toEqual([]);
});

function audit(state: {
  errors: string[];
  external: string[];
  unexpected: string[];
}) {
  expect(state.errors).toEqual([]);
  expect(state.external).toEqual([]);
  expect(state.unexpected).toEqual([]);
}

test("confirmed responses advance versions immediately and stale list replies cannot regress them", async ({
  page,
}) => {
  const state = await fixture(page),
    gate = barrier();
  let held = false,
    delivered = false;
  state.setRead(async (route) => {
    held = true;
    await gate.promise;
    await route.fulfill({ json: [lead()] });
    delivered = true;
  });
  // This list snapshot started before either mutation and is deliberately stale.
  await page.getByRole("button", { name: /Leads/ }).click();
  await expect.poll(() => held).toBe(true);
  await page.getByRole("button", { name: /Opportunities/ }).click();
  await page.getByTestId("property-row").click();
  const detail = page.getByTestId("property-detail"),
    note = page.getByLabel("Lead note", { exact: true });
  await note.fill("Synthetic next-version note");
  await page
    .getByLabel("Lead status", { exact: true })
    .selectOption("qualified");
  await expect(detail).toContainText("Saved as a lead · version 2");
  await expect(note).toHaveValue("Synthetic next-version note");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(detail).toContainText("Saved as a lead · version 3");
  await expect(note).toHaveValue("");
  expect(state.mutations.map((request) => request.expectedVersion)).toEqual([
    1, 2,
  ]);
  expect(state.mutations.map((request) => request.response)).toEqual([
    200, 200,
  ]);
  gate.release();
  await expect.poll(() => delivered).toBe(true);
  await settle(page);
  await expect(detail).toContainText("Saved as a lead · version 3");
  // Even a newly requested but stale backend snapshot cannot roll back a confirmation.
  state.setRead((route) => route.fulfill({ json: [lead()] }));
  const stale = page.waitForResponse(
    (response) =>
      response.url().includes("/api/leads?") &&
      response.request().method() === "GET",
  );
  await page.getByRole("button", { name: /Leads/ }).click();
  await stale;
  await settle(page);
  await expect(page.getByRole("region", { name: "Saved leads" })).toContainText(
    "version 3",
  );
  await expect(
    page.getByLabel(`Lead status ${property.id}`, { exact: true }),
  ).toHaveValue("qualified");
  audit(state);
});

for (const editBackToSubmittedText of [false, true]) {
  test(`a double note click sends once and preserves ${editBackToSubmittedText ? "an edited draft restored to its submitted text" : "a newer edited draft"}`, async ({
    page,
  }) => {
    const state = await fixture(page),
      gate = barrier();
    let attempts = 0;
    state.setMutation(async (route) => {
      attempts++;
      if (attempts === 1) await gate.promise;
      await state.mutate(route);
    });
    const note = page.getByLabel("Lead note", { exact: true }),
      save = page.getByRole("button", { name: "Save note", exact: true });
    await note.fill("Synthetic submitted note");
    await save.evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => attempts).toBe(1);
    await expect(save).toBeDisabled();
    await expect(
      page.getByLabel("Lead status", { exact: true }),
    ).toBeDisabled();
    await expect(note).toBeEnabled();
    await note.fill("Synthetic later draft");
    if (editBackToSubmittedText) await note.fill("Synthetic submitted note");
    gate.release();
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 2",
    );
    await expect(note).toHaveValue(
      editBackToSubmittedText
        ? "Synthetic submitted note"
        : "Synthetic later draft",
    );
    expect(attempts).toBe(1);
    await save.click();
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 3",
    );
    await expect(note).toHaveValue("");
    expect(state.mutations.map((request) => request.expectedVersion)).toEqual([
      1, 2,
    ]);
    audit(state);
  });
}

for (const response of [
  { name: "conflict", status: 409, json: { message: "Synthetic conflict" } },
  { name: "failure", status: 500, json: { message: "Synthetic failure" } },
  {
    name: "invalid schema",
    status: 200,
    json: { ...lead(), version: "invalid" },
  },
  {
    name: "wrong session",
    status: 200,
    json: lead("synthetic-unrelated-session", 2),
  },
  {
    name: "wrong lead",
    status: 200,
    json: { ...lead(), id: "synthetic-unrelated-lead", version: 2 },
  },
  {
    name: "wrong property",
    status: 200,
    json: { ...lead(), propertyId: "SYN-UNRELATED", version: 2 },
  },
  {
    name: "wrong snapshot",
    status: 200,
    json: { ...lead(), snapshotId: "synthetic-unrelated-snapshot", version: 2 },
  },
  { name: "nonadvancing version", status: 200, json: lead() },
  {
    name: "missing appended history",
    status: 200,
    json: { ...lead(), version: 2 },
  },
  {
    name: "unconfirmed note value",
    status: 200,
    json: {
      ...lead(),
      version: 2,
      events: [
        ...lead().events,
        {
          kind: "note",
          at: "2026-10-28T00:00:01.000Z",
          note: "Different from submitted draft",
        },
      ],
    },
  },
]) {
  test(`a ${response.name} response preserves the note draft and releases the controls`, async ({
    page,
  }) => {
    const state = await fixture(page);
    state.setMutation((route) =>
      route.fulfill({ status: response.status, json: response.json }),
    );
    const note = page.getByLabel("Lead note", { exact: true }),
      save = page.getByRole("button", { name: "Save note", exact: true });
    await note.fill("Synthetic retained failed draft");
    const received = page.waitForResponse(
      (result) => result.request().method() === "PATCH",
    );
    await save.click();
    await received;
    await expect(save).toBeEnabled();
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("status")).not.toContainText("Lead updated.");
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 1",
    );
    await expect(note).toHaveValue("Synthetic retained failed draft");
    await expect(page.getByLabel("Lead status", { exact: true })).toBeEnabled();
    audit(state);
  });
}

test("create double click is guarded and consumes its confirmed response without a list refresh", async ({
  page,
}) => {
  const state = await fixture(page, { saved: false }),
    gate = barrier();
  let attempts = 0,
    reads = 0;
  state.setMutation(async (route) => {
    attempts++;
    await gate.promise;
    await state.mutate(route);
  });
  state.setRead(async (route) => {
    reads++;
    await route.fulfill({ json: [] });
  });
  const create = page.getByRole("button", { name: /Create lead/ });
  await create.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect.poll(() => attempts).toBe(1);
  await expect(create).toBeDisabled();
  gate.release();
  await expect(page.getByTestId("property-detail")).toContainText(
    "Saved as a lead · version 1",
  );
  expect(attempts).toBe(1);
  expect(reads).toBe(0);
  await expect(page.getByLabel("Lead status", { exact: true })).toBeEnabled();
  audit(state);
});

for (const response of [
  { name: "invalid schema", json: { ...lead(), version: "invalid" } },
  { name: "wrong session", json: lead("synthetic-unrelated-session") },
  { name: "wrong property", json: { ...lead(), propertyId: "SYN-UNRELATED" } },
  {
    name: "wrong snapshot",
    json: { ...lead(), snapshotId: "synthetic-unrelated-snapshot" },
  },
]) {
  test(`a create ${response.name} reply is rejected without creating a local lead`, async ({
    page,
  }) => {
    const state = await fixture(page, { saved: false });
    state.setMutation((route) => route.fulfill({ json: response.json }));
    const create = page.getByRole("button", { name: /Create lead/ });
    const received = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname === "/api/leads",
    );
    await create.click();
    await received;
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("status")).not.toContainText("Lead saved.");
    await expect(create).toBeEnabled();
    await expect(page.getByRole("button", { name: /Leads/ })).toContainText(
      "0",
    );
    await expect(page.getByTestId("property-detail")).not.toContainText(
      "Saved as a lead",
    );
    audit(state);
  });
}

test("a pending board status disables detail mutations until its confirmed response", async ({
  page,
}) => {
  const state = await fixture(page),
    gate = barrier();
  let held = false;
  state.setMutation(async (route) => {
    held = true;
    await gate.promise;
    await state.mutate(route);
  });
  await page.getByRole("button", { name: /Leads/ }).click();
  const boardStatus = page.getByLabel(`Lead status ${property.id}`, {
    exact: true,
  });
  await boardStatus.selectOption("qualified");
  await expect.poll(() => held).toBe(true);
  await expect(boardStatus).toBeDisabled();
  await page
    .getByRole("button", { name: "Review evidence", exact: true })
    .click();
  await expect(page.getByLabel("Lead status", { exact: true })).toBeDisabled();
  await page
    .getByLabel("Lead note", { exact: true })
    .fill("Synthetic board pending draft");
  await expect(
    page.getByRole("button", { name: "Save note", exact: true }),
  ).toBeDisabled();
  gate.release();
  await expect(page.getByTestId("property-detail")).toContainText(
    "Saved as a lead · version 2",
  );
  await expect(page.getByLabel("Lead note", { exact: true })).toHaveValue(
    "Synthetic board pending draft",
  );
  await expect(boardStatus).toBeEnabled();
  expect(state.mutations).toHaveLength(1);
  audit(state);
});

for (const oldStatus of [200, 401]) {
  test(`an old-session late ${oldStatus} mutation cannot change the new session or release its pending guard`, async ({
    page,
  }) => {
    const state = await fixture(page),
      oldGate = barrier(),
      newGate = barrier();
    let oldHeld = false,
      oldDelivered = false,
      newHeld = false;
    state.setMutation(async (route) => {
      const body = LeadUpdateSchema.parse(route.request().postDataJSON());
      if (body.sessionId === "synthetic-session-A") {
        oldHeld = true;
        await oldGate.promise;
        await route.fulfill({
          status: oldStatus,
          json:
            oldStatus === 200
              ? { ...lead(), status: "qualified", version: 2 }
              : { message: "Synthetic old session expired" },
        });
        oldDelivered = true;
      } else {
        newHeld = true;
        await newGate.promise;
        await state.mutate(route);
      }
    });
    await page
      .getByLabel("Lead status", { exact: true })
      .selectOption("qualified");
    await expect.poll(() => oldHeld).toBe(true);
    await page
      .getByRole("button", { name: "Close property detail", exact: true })
      .click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Open the review workspace",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Review access code", { exact: true })
      .fill("synthetic-only-entry");
    await page
      .getByRole("button", { name: "Open workspace", exact: true })
      .click();
    await expect(page.getByTestId("property-row")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Leads/ })).toContainText(
      "1",
    );
    await page.getByTestId("property-row").click();
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 7",
    );
    const note = page.getByLabel("Lead note", { exact: true }),
      save = page.getByRole("button", { name: "Save note", exact: true });
    await note.fill("Synthetic new session draft");
    await expect(save).toBeEnabled();
    await save.click();
    await expect.poll(() => newHeld).toBe(true);
    await expect(save).toBeDisabled();
    oldGate.release();
    await expect.poll(() => oldDelivered).toBe(true);
    await settle(page);
    await expect(save).toBeDisabled();
    await expect(note).toHaveValue("Synthetic new session draft");
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 7",
    );
    await expect(page.getByLabel("Lead status", { exact: true })).toHaveValue(
      "new",
    );
    await expect(
      page.getByRole("heading", {
        name: "Open the review workspace",
        exact: true,
      }),
    ).toHaveCount(0);
    newGate.release();
    await expect(page.getByTestId("property-detail")).toContainText(
      "Saved as a lead · version 8",
    );
    await expect(note).toHaveValue("");
    expect(state.mutations.map((request) => request.expectedVersion)).toEqual([
      7,
    ]);
    audit(state);
  });
}
