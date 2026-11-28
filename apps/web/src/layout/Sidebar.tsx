import { ComingSoon } from "./ComingSoon.tsx";

export type Route = "map" | "leads";
export const FUTURE_SECTIONS = [
  "Campaigns",
  "Estimates & Quotes",
  "Jobs & Scheduling",
  "Invoicing",
  "Storm Tracking",
  "Team & Territories",
] as const;

export function Sidebar({ route, leadCount }: { route: Route; leadCount?: number }) {
  return (
    <nav className="sidebar" aria-label="CRM sections">
      <div className="brand">Roofing Leads</div>
      <a
        href="#/map"
        className={`nav-item${route === "map" ? " active" : ""}`}
        aria-current={route === "map" ? "page" : undefined}
      >
        Map
      </a>
      <a
        href="#/leads"
        className={`nav-item${route === "leads" ? " active" : ""}`}
        aria-current={route === "leads" ? "page" : undefined}
      >
        Leads{leadCount !== undefined ? <span className="count">{leadCount}</span> : null}
      </a>
      <div className="nav-group" aria-label="Future sections">
        <div className="nav-heading">Coming soon</div>
        {FUTURE_SECTIONS.map((s) => (
          <ComingSoon key={s} label={s} />
        ))}
      </div>
    </nav>
  );
}
