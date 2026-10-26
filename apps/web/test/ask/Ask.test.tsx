// `/ask` redirects to the map's AI mode (the agent is the map's AI mode, CRM-HANDOFF 4.7), keeping
// the question so the panel can prefill its box. Never asks by itself.
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { askRedirectTo, Component as Ask } from "../../src/routes/Ask/Ask";

function Where() {
  const { pathname, search } = useLocation();
  return <span data-testid="where">{`${pathname}${search}`}</span>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/ask" element={<Ask />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("/ask redirect", () => {
  it("goes to the map in AI mode", () => {
    renderAt("/ask");
    expect(screen.getByTestId("where").textContent).toBe("/?mode=ai");
  });

  it("keeps the question for the panel to prefill", () => {
    renderAt(`/ask?q=${encodeURIComponent("roofs near Manor")}`);
    expect(screen.getByTestId("where").textContent).toBe("/?mode=ai&q=roofs+near+Manor");
  });

  it("drops an empty question", () => {
    expect(askRedirectTo("q=%20%20")).toBe("/?mode=ai");
    expect(askRedirectTo("")).toBe("/?mode=ai");
  });
});
