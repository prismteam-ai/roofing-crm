// /map is the handoff's name for the map (CRM-HANDOFF routes table: /map?view=list,
// /map?triage=1) and what Leads' "Show on map" links to. The map itself lives at "/", so /map
// must land there with its query string intact.
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { MapAlias } from "../../src/routes/MapAlias.js";

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

describe("/map alias", () => {
  it("redirects to the map at / and keeps the query string", () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/map?lat=30.4&lng=-97.6&r=10&view=list"]}>
        <Routes>
          <Route path="/map" element={<MapAlias />} />
          <Route path="/" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(getByTestId("where").textContent).toBe("/?lat=30.4&lng=-97.6&r=10&view=list");
  });
});
