// B-07 T024 / B-09 board match (CrmLeads390/768/1440, CrmLeadsFiltered1440, CrmLeadsPaged*, and the
// state boards Loading, Empty, NoMatch, Error, Partial): the paginated lead list. Consumes
// `leads.list` through leadsApi (the one shared tRPC client); filters live in the URL
// (leadFilters.state.ts) and render in LeadFilters (status, assignee, roof, permit, permit open,
// within; a sheet below 600 px). Atlas tokens and components only. Columns follow the board: Lead
// (TCAD id link, coordinates, source), Status (pill, assignee under it), Roof, Main permit and Last
// activity, from the `signals` and `lastActivity` the list returns beside each lead. A list from an
// older API, or a lead with no stored snapshot, has neither: the cell then says why (leadRowFacts).
// States: loading, error with Retry, no leads yet, no match, partial (a lead whose property left
// the current run keeps its snapshot, AC-5), never an endless spinner. Numbered pages: page n is
// offset (n - 1) x 25 (`page=` in the URL); the API reads at most 1,000 leads.
import { Icon, StatusPill } from "@crm/ui";
import type { LeadStatus } from "@crm/shared";
import { useMemo, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router";
import { Skeleton } from "../../components/Skeleton.js";
import { LeadBanner } from "./LeadBanner.js";
import { LeadProgress } from "./LeadProgress.js";
import { LeadActions, LeadFilters, STATUS_LABEL, filterSummary } from "./LeadFilters.js";
import {
  LEAD_LIST_CAP,
  LEAD_PAGE_SIZE,
  hasActiveFilters,
  parseLeadQuery,
  patchLeadParams,
  toLeadsListInput,
  type LeadQuery,
  type LeadQueryPatch,
} from "./leadFilters.state.js";
import { leadTime, leadTimeExact, myIds, originLabel, personLabel } from "./leadFormat.js";
import {
  lastActivityCell,
  pageWindow,
  permitCell,
  roofCell,
  totalPages,
  type FactCell,
} from "./leadRowFacts.js";
import { useLeadsList, type LeadListItem } from "./leadsApi.js";
import styles from "./Leads.module.css";

export const LEAD_STATUS_KIND = {
  new: "info",
  contacted: "warning",
  qualified: "verified",
  won: "verified",
  lost: "unavailable",
} as const satisfies Record<LeadStatus, "info" | "warning" | "verified" | "unavailable">;

/** The board's status icons (CrmLeads*: Contacted phone, Qualified check, New new-box). */
export const LEAD_STATUS_ICON = {
  new: "add_circle",
  contacted: "call",
  qualified: "check_circle",
  won: "emoji_events",
  lost: "cancel",
} as const satisfies Record<LeadStatus, string>;

/** True when the title is the TCAD fallback: the contract publishes no street address
 *  (design-review-log row 1), so the row says so instead of showing a made-up one. */
export function isFallbackTitle(address: string): boolean {
  return address.startsWith("TCAD ");
}

export function coordinateText(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`.replace(/-/g, "−");
}

function Fact({ label, cell }: { readonly label: string; readonly cell: FactCell }): ReactElement {
  return (
    <div className={styles.fact} data-field={label}>
      <span className={styles.pre}>{`${label} `}</span>
      <span className={cell.reason === true ? styles.reason : styles.factMain}>{cell.main}</span>
      {cell.sub === undefined ? null : <span className={styles.sub}>{cell.sub}</span>}
      {cell.extra?.map((line) => (
        <span key={line} className={styles.sub}>
          {line}
        </span>
      ))}
    </div>
  );
}

function LeadRow({
  lead,
  mine,
}: {
  readonly lead: LeadListItem;
  readonly mine: readonly string[];
}): ReactElement {
  const activity = lastActivityCell(lead.lastActivity, lead.createdAt);
  return (
    <li className={styles.row} data-lead-id={lead.leadId}>
      <div className={styles.cellLead}>
        <Link className={styles.cardLink} to={`/leads/${encodeURIComponent(lead.leadKey)}`}>
          {lead.address}
        </Link>
        {isFallbackTitle(lead.address) ? (
          <span className={styles.sub}>
            {`Address not published · ${coordinateText(lead.lat, lead.lon)}`}
          </span>
        ) : null}
        <span className={styles.sub}>{`From ${originLabel(lead.createdFrom)}`}</span>
      </div>
      <div className={styles.cellStatus}>
        <StatusPill
          status={LEAD_STATUS_KIND[lead.status]}
          text={STATUS_LABEL[lead.status]}
          icon={LEAD_STATUS_ICON[lead.status]}
        />
        {lead.notInCurrentRun ? (
          <StatusPill
            status="warning"
            text="Not in the current run · snapshot"
            icon="history"
            data={{ field: "run" }}
          />
        ) : null}
        <span className={styles.assigneeName}>
          <span className={styles.srOnly}>Assignee </span>
          {personLabel(lead.assignee, mine)}
        </span>
      </div>
      <div className={styles.facts}>
        <Fact label="Roof" cell={roofCell(lead.signals)} />
        <Fact label="Main permit" cell={permitCell(lead.signals)} />
        <div className={styles.fact} data-field="Last activity">
          <span className={styles.pre}>Last activity </span>
          <span className={styles.factMain}>
            {activity.created ? "Created " : ""}
            <time dateTime={activity.at} title={leadTimeExact(activity.at)}>
              {leadTime(activity.at)}
            </time>
          </span>
          {activity.text === undefined ? null : <span className={styles.sub}>{activity.text}</span>}
        </div>
      </div>
    </li>
  );
}

function PageButton({
  label,
  ariaLabel,
  current = false,
  disabled = false,
  onClick,
}: {
  readonly label: ReactElement | string;
  readonly ariaLabel?: string;
  readonly current?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`${styles.pageBtn} ${current ? styles.pageCurrent : ""}`}
      aria-label={ariaLabel}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Component(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const query: LeadQuery = useMemo(() => parseLeadQuery(searchParams), [searchParams]);
  const result = useLeadsList(toLeadsListInput(query));
  const patch = (next: LeadQueryPatch): void =>
    setSearchParams((prev) => patchLeadParams(prev, next));
  const mine = useMemo(() => myIds(), []);

  const filtered = hasActiveFilters(query);
  const loaded = result.status === "success" ? result.data : undefined;
  const pastEnd = loaded !== undefined && loaded.leads.length === 0 && loaded.totalCount > 0;
  const noLeadsYet = loaded !== undefined && loaded.leads.length === 0 && !filtered && !pastEnd;
  const noMatch = loaded !== undefined && loaded.leads.length === 0 && filtered && !pastEnd;
  const summary = filterSummary(query);

  const head = (
    <header className={styles.head}>
      <div className={styles.headTitle}>
        <h2 id="leads-title" className={styles.title}>
          Leads
        </h2>
        <span className={styles.headCount} aria-hidden="true">
          {loaded === undefined ? "" : `· ${loaded.totalCount}`}
        </span>
      </div>
      <LeadActions query={query} />
    </header>
  );

  let body: ReactElement;
  if (result.status === "pending") {
    body = (
      <>
        <p className={styles.count}>
          <span>… leads</span>
        </p>
        <div className={styles.loadingCard} aria-busy="true">
          <LeadProgress label="Loading your leads" />
          <p className={styles.loadingText} role="status">
            Loading your leads…
          </p>
          <Skeleton variant="cards" count={3} />
        </div>
      </>
    );
  } else if (result.status === "error") {
    body = (
      <>
        <LeadBanner
          kind="error"
          icon="error"
          headline="Leads couldn't load."
          actionLabel="Retry"
          onAction={() => {
            void result.refetch();
          }}
        >
          The lead store didn't answer. Nothing was lost; your filters are kept.
        </LeadBanner>
      </>
    );
  } else if (pastEnd) {
    body = (
      <section className={styles.stateCard} aria-labelledby="leads-pastend" role="status">
        <h3 id="leads-pastend" className={styles.stateTitle}>
          {`There is no page ${query.page}`}
        </h3>
        <p className={styles.stateBody}>
          {`${loaded.totalCount} ${loaded.totalCount === 1 ? "lead matches" : "leads match"}; they fit on ${totalPages(loaded.totalCount)} ${totalPages(loaded.totalCount) === 1 ? "page" : "pages"}.`}
        </p>
        <button type="button" className={styles.tonal} onClick={() => patch({ page: null })}>
          Go to page 1
        </button>
      </section>
    );
  } else if (noLeadsYet) {
    body = (
      <section className={styles.stateCard} aria-labelledby="leads-empty" role="status">
        <Icon name="contact_page" />
        <h3 id="leads-empty" className={styles.stateTitle}>
          No leads yet
        </h3>
        <p className={styles.stateBody}>
          Create your first lead from the map: find aged roofs and long-open permits, then choose
          Create lead.
        </p>
        <Link className={styles.primary} to="/">
          <Icon name="map" size="medium" />
          Go to map
        </Link>
      </section>
    );
  } else if (noMatch) {
    body = (
      <>
        <p className={styles.count}>
          <span>0 leads</span>
          {summary === null ? null : (
            <>
              <span aria-hidden="true">{" · "}</span>
              <span>{summary}</span>
            </>
          )}
        </p>
        <section className={styles.stateCard} aria-labelledby="leads-nomatch" role="status">
          <h3 id="leads-nomatch" className={styles.stateTitle}>
            No leads match these filters
          </h3>
          <p className={styles.stateBody}>
            Clear filters, or widen the radius or lower the roof age.
          </p>
          <button
            type="button"
            className={styles.tonal}
            onClick={() =>
              patch({
                roof: null,
                permit: null,
                permitOpen: null,
                lat: null,
                lng: null,
                r: null,
                status: null,
                assignee: null,
              })
            }
          >
            Clear filters
          </button>
        </section>
      </>
    );
  } else if (loaded !== undefined) {
    const { leads, totalCount } = loaded;
    const flagged = leads.filter((lead) => lead.notInCurrentRun).length;
    const first = (query.page - 1) * LEAD_PAGE_SIZE + 1;
    const last = first + leads.length - 1;
    const pages = totalPages(totalCount);
    const capped = totalCount >= LEAD_LIST_CAP;
    const goTo = (page: number): void => patch({ page });
    body = (
      <>
        <p className={styles.count}>
          <span>{`${totalCount} ${totalCount === 1 ? "lead" : "leads"}`}</span>
          <span aria-hidden="true">{" · "}</span>
          <span>{summary ?? "all mine"}</span>
          {flagged === 0 ? null : (
            <>
              <span aria-hidden="true">{" · "}</span>
              <span className={styles.countNote}>
                {`${flagged} not in the current run keeps its snapshot`.replace(
                  "keeps",
                  flagged === 1 ? "keeps" : "keep",
                )}
              </span>
            </>
          )}
        </p>
        <div className={styles.thead} aria-hidden="true">
          <span>Lead</span>
          <span>Status</span>
          <span>Roof</span>
          <span>Main permit</span>
          <span>Last activity</span>
        </div>
        <ul className={styles.list}>
          {leads.map((lead) => (
            <LeadRow key={lead.leadKey} lead={lead} mine={mine} />
          ))}
        </ul>
        <nav className={styles.pager} aria-label="Lead pages">
          <span className={styles.pagerText}>
            {`Showing ${first}–${last} of ${totalCount.toLocaleString("en-US")}${capped ? " · first 1,000 shown" : ""} · newest created first`}
          </span>
          {pages <= 1 ? null : (
            <span className={styles.pagerButtons}>
              <span className={styles.pagerOf}>{`${query.page} of ${pages}`}</span>
              <PageButton
                ariaLabel="Previous page"
                label={<Icon name="chevron_left" size="medium" />}
                disabled={query.page <= 1}
                onClick={() => goTo(query.page - 1)}
              />
              {pageWindow(query.page, pages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} className={styles.pagerGap} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <PageButton
                    key={p}
                    label={String(p)}
                    current={p === query.page}
                    onClick={() => goTo(p)}
                  />
                ),
              )}
              <PageButton
                ariaLabel="Next page"
                label={<Icon name="chevron_right" size="medium" />}
                disabled={query.page >= pages}
                onClick={() => goTo(query.page + 1)}
              />
            </span>
          )}
        </nav>
      </>
    );
  } else {
    body = <></>;
  }

  return (
    <section className={styles.page} aria-labelledby="leads-title">
      <LeadFilters
        query={query}
        params={searchParams}
        onPatch={patch}
        totalCount={loaded?.totalCount}
        head={head}
        noMatch={noMatch}
        hidePanel={noLeadsYet}
      />
      {body}
    </section>
  );
}
