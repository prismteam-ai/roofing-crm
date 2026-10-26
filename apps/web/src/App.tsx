// Route table (plan.md "Project Structure"): /sign-in (public, no session needed) and everything
// else behind RequireSession + AppShell (Map at "/", Coming Soon at /coming-soon/:section).
import type { ReactElement } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { RequireSession } from "./auth/RequireSession.js";
import { AppShell } from "./components/AppShell.js";
import { Component as Ask } from "./routes/Ask/Ask.js";
import { Component as ComingSoon } from "./routes/ComingSoon.js";
import { Component as LeadDetail } from "./routes/Leads/LeadDetail.js";
import { Component as LeadsList } from "./routes/Leads/LeadsList.js";
import { Component as MapRoute } from "./routes/Map/Map.js";
import { Component as NotFound } from "./routes/NotFound.js";
import { MapAlias } from "./routes/MapAlias.js";
import { Component as SignIn } from "./routes/SignIn/SignIn.js";

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route
          element={
            <RequireSession>
              <AppShell />
            </RequireSession>
          }
        >
          <Route path="/" element={<MapRoute />} />
          <Route path="/map" element={<MapAlias />} />
          <Route path="/leads" element={<LeadsList />} />
          <Route path="/leads/:leadKey" element={<LeadDetail />} />
          <Route path="/ask" element={<Ask />} />
          <Route path="/coming-soon/:section" element={<ComingSoon />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
