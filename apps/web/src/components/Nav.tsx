/**
 * The assignment asks for disabled sections showing where the product would
 * expand beyond lead identification, so these are visible but explicitly inert.
 */
const FUTURE_SECTIONS = [
  'Jobs & Estimates',
  'Scheduling & Dispatch',
  'Invoicing & Payments',
  'Crew Management',
  'Materials & Supplier Orders',
  'Outreach Automation',
  'Reporting & Analytics',
] as const;

export type ActiveView = 'leads' | 'pipeline' | 'agent';

export function Nav({ active, onChange }: { active: ActiveView; onChange: (v: ActiveView) => void }) {
  return (
    <nav className="nav" aria-label="Main">
      <div className="nav__brand">
        <span className="nav__mark" aria-hidden="true" />
        <span>Roofing Lead CRM</span>
      </div>

      <div className="nav__group">
        <p className="nav__heading">Lead identification</p>
        {(['leads', 'pipeline', 'agent'] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={`nav__item ${active === view ? 'is-active' : ''}`}
            aria-current={active === view ? 'page' : undefined}
            onClick={() => onChange(view)}
          >
            {view === 'leads' ? 'Map & candidates' : view === 'pipeline' ? 'Lead pipeline' : 'Ask the agent'}
          </button>
        ))}
      </div>

      <div className="nav__group">
        <p className="nav__heading">Coming soon</p>
        {FUTURE_SECTIONS.map((label) => (
          <button
            key={label}
            type="button"
            className="nav__item is-disabled"
            disabled
            aria-disabled="true"
            title="Planned for a later release — outside the lead-identification scope"
          >
            {label}
            <span className="nav__badge">Soon</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
