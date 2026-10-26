// T029: adapts the copied Task A A-13 pattern (T002) to the CRM's own five roadmap sections
// (packages/shared's RoadmapSection enum) and a "Back to Map" action — makes T025 pass. Task A's
// "other county"/Explore logic is CRM-out-of-scope (this app has no county-explore route) and is
// removed, not ported (docs/reuse-log.md).
// Layout follows the CRM boards CrmComingSoon390/768/1440: a centred card "{Section} is coming
// soon", its purpose and "planned for the Roofing CRM but not part of this release", a
// provenance line and a filled Back to Map button (no skeleton: the boards draw none). The
// sections, titles and purpose lines come from ROADMAP_NAV (components/AppShell/navigation.ts),
// the same table the navigation draws; the route is /coming-soon/:section (App.tsx).
import type { ReactElement } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "@crm/ui";
import { LIVE_SECTION_LABELS, ROADMAP_NAV } from "../components/AppShell/navigation.js";
import styles from "./ComingSoon.module.css";

const PLANNED =
  "It is planned for the Roofing CRM but not part of this release, so there is nothing to open yet.";

const LIVE_SECTIONS = `Roofing CRM · ${LIVE_SECTION_LABELS.join(" and ")}`;

interface CardProps {
  readonly state: "ready" | "not-found";
  readonly label: string;
  readonly itemId?: string;
  readonly title: string;
  readonly body: string;
  readonly provenance: string;
}

function ComingSoonCard({
  state,
  label,
  itemId,
  title,
  body,
  provenance,
}: CardProps): ReactElement {
  return (
    <section aria-label={label} data-route="coming-soon" data-state={state} className={styles.page}>
      <div data-coming-soon-item={itemId} className={styles.card}>
        <span className={styles.icon}>
          <Icon name="schedule" />
        </span>
        <h2 id="coming-soon-title" className={styles.title}>
          {title}
        </h2>
        <p id="coming-soon-body" className={styles.body} data-coming-soon-sentence="">
          {body}
        </p>
        <p className={styles.provenance}>
          <Icon name="info" size="small" />
          <span>{provenance}</span>
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.button} data-variant="filled">
            <Icon name="map" size="medium" />
            Back to Map
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Component(): ReactElement {
  const { section } = useParams();
  const item = ROADMAP_NAV.find((entry) => entry.section === section);

  if (item === undefined) {
    return (
      <ComingSoonCard
        state="not-found"
        label="Section not found"
        title="There’s no section here"
        body={`This link doesn’t match a CRM section. The live sections are ${LIVE_SECTION_LABELS.join(" and ")}.`}
        provenance={`Roofing CRM · unknown section “${String(section ?? "").slice(0, 24)}”`}
      />
    );
  }

  return (
    <ComingSoonCard
      state="ready"
      label={`${item.label} (coming soon)`}
      itemId={item.section}
      title={`${item.label} is coming soon`}
      body={`${item.line} ${PLANNED}`}
      provenance={LIVE_SECTIONS}
    />
  );
}
