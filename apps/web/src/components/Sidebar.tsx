const DISABLED = ['Outreach campaigns', 'Quotes & estimates', 'Scheduling', 'Analytics', 'Billing'];

export function Sidebar({ page, leadCount }: { page: 'map' | 'leads'; leadCount: number | null }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ▲
        </span>
        <span>Roofing CRM</span>
      </div>
      <a href="#/" className={page === 'map' ? 'nav active' : 'nav'} data-testid="nav-map">
        Lead finder
      </a>
      <a href="#/leads" className={page === 'leads' ? 'nav active' : 'nav'} data-testid="nav-leads">
        Leads
        {leadCount !== null && (
          <span className="badge" data-testid="lead-count-badge">
            {leadCount}
          </span>
        )}
      </a>
      <div className="nav-group">Coming soon</div>
      {DISABLED.map((label) => (
        <button
          key={label}
          type="button"
          className="nav disabled"
          disabled
          aria-disabled="true"
          title="Coming soon"
          data-tooltip="coming soon"
          data-testid={`nav-disabled-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
        >
          {label}
          <span className="soon">coming soon</span>
        </button>
      ))}
    </nav>
  );
}
