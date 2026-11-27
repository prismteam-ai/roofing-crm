import type { Panel, View } from '../lib/urlState.js';

export interface NavTarget {
  view: View;
  panel?: Panel;
}

export interface NavProps {
  view: View;
  panel: Panel;
  leadCount: number;
  open: boolean;
  onNavigate: (target: NavTarget) => void;
}

interface NavItem extends NavTarget {
  id: string;
  label: string;
}

const ITEMS: readonly NavItem[] = [
  { id: 'map', label: 'Lead Map', view: 'map', panel: 'list' },
  { id: 'leads', label: 'Leads', view: 'leads' },
  { id: 'agent', label: 'Ask the agent', view: 'map', panel: 'agent' },
  { id: 'data', label: 'Data', view: 'data' },
];

/** Planned areas beyond lead identification. Shown so the roadmap is visible; none of them work. */
export const FUTURE_SECTIONS: readonly { id: string; label: string; detail: string }[] = [
  { id: 'outreach', label: 'Outreach Campaigns', detail: 'SMS, email and door-knock' },
  { id: 'estimates', label: 'Estimates & Quotes', detail: 'Measurements and pricing' },
  { id: 'jobs', label: 'Jobs & Scheduling', detail: 'Schedule won roofing jobs' },
  { id: 'claims', label: 'Insurance Claims', detail: 'Storm claims and adjusters' },
  { id: 'dispatch', label: 'Crew Dispatch', detail: 'Crews and daily routes' },
  { id: 'reports', label: 'Reports & Forecasting', detail: 'Pipeline and revenue' },
  { id: 'integrations', label: 'Integrations', detail: 'Accounting, dialer, e-sign' },
];

function isActive(item: NavItem, view: View, panel: Panel): boolean {
  if (item.view !== view) return false;
  return item.view !== 'map' || (item.panel ?? 'list') === panel;
}

export function Nav({ view, panel, leadCount, open, onNavigate }: NavProps) {
  return (
    <nav
      className={`nav${open ? ' is-open' : ''}`}
      id="primary-nav"
      aria-label="Primary"
      data-testid="nav"
    >
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="28" height="28">
            <rect width="32" height="32" rx="7" fill="currentColor" />
            <path
              d="M6 18 16 8l10 10v7H6z"
              fill="none"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>
          <span className="brand-name">Roofing Lead CRM</span>
          <span className="brand-sub">Lead identification</span>
        </span>
      </div>

      <ul className="nav-list">
        {ITEMS.map((item) => {
          const active = isActive(item, view, panel);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-${item.id}`}
                onClick={() => {
                  onNavigate({ view: item.view, panel: item.panel });
                }}
              >
                {item.label}
                {item.id === 'leads' && leadCount > 0 && (
                  <span
                    className="count"
                    data-testid="nav-lead-count"
                    aria-label={`${String(leadCount)} leads`}
                  >
                    {leadCount}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="nav-heading" id="nav-future">
        Planned, not built yet
      </h2>
      <ul className="nav-list nav-future" aria-labelledby="nav-future" data-testid="nav-future">
        {FUTURE_SECTIONS.map((section) => (
          <li
            key={section.id}
            title={`${section.label}: ${section.detail}. Coming soon, not available yet.`}
          >
            <button
              type="button"
              className="nav-item is-disabled"
              disabled
              aria-disabled="true"
              data-testid={`nav-future-${section.id}`}
            >
              <span>{section.label}</span>
              <span className="tag">Coming soon</span>
              <span className="nav-future-detail">{section.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
