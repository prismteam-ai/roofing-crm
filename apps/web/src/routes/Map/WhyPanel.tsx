// "Why {property} is a lead" (CRM-HANDOFF §4.3, board Explore1440 `whyView`): replaces the results
// list in the results pane. Every rule the property meets with its value, source, run and CID,
// then the coordinates, and the two actions the board has: Verify CID (CountyLens's Data · Verify
// page for that CID) and Details (the property drawer). Render-only over `whyLead`.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { Icon } from "@crm/ui";
import { useEffect, useRef, type ReactElement } from "react";
import { useShellAppLinks } from "../../components/AppShell/shellApi.js";
import { candidateTitle } from "./Candidates/candidates.js";
import { WhyBody } from "./WhyBody.js";
import styles from "./WhyPanel.module.css";

export interface WhyPanelProps {
  readonly property: Provenanced<CrmProperty>;
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  readonly centreLabel?: string | undefined;
  readonly onBack: () => void;
  readonly onDetails: (propertyCid: string) => void;
}

export function WhyPanel({
  property,
  permits,
  center,
  radiusMi,
  centreLabel,
  onBack,
  onDetails,
}: WhyPanelProps): ReactElement {
  const links = useShellAppLinks();
  const ref = useRef<HTMLElement>(null);
  // The panel replaces the list, which was scrolled to the row that was opened, in a scrolling
  // sheet or pane that keeps its scroll position: scroll that container back to the top so the
  // panel's title and Back are on screen, and take focus (without the browser scrolling anything
  // else) so keyboard and screen-reader users land on it.
  useEffect(() => {
    const panel = ref.current;
    if (panel === null) return;
    panel.focus({ preventScroll: true });
    for (let el = panel.parentElement; el !== null; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        el.scrollTop = 0;
        break;
      }
    }
  }, []);
  const title = candidateTitle(property);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.panel}
      aria-label={`Why ${title} is a lead`}
      data-why-panel=""
      data-property-cid={property.propertyCid}
    >
      <button type="button" className={styles.back} onClick={onBack}>
        <Icon name="arrow_back" size="medium" />
        Back to results
      </button>
      <div className={styles.head}>
        <h3 className={styles.title}>{`Why ${title} is a lead`}</h3>
        <p className={styles.sub}>Every rule, its value, the source, the run and the CID</p>
      </div>
      <WhyBody
        property={property}
        permits={permits}
        center={center}
        radiusMi={radiusMi}
        centreLabel={centreLabel}
        countyLensUrl={links.data?.countyLensUrl}
        onDetails={onDetails}
      />
    </section>
  );
}
