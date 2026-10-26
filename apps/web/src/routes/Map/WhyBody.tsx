// The body of "Why is this a lead?": every rule the property meets with its value, source, run and
// CID, the coordinates, and Verify CID (and Details where a caller wants it). Shared by the
// results-pane WhyPanel and the property drawer's inline "Why this is a lead" section, so both read
// the same rows. Render-only over `whyLead`; the CountyLens URL comes from the caller.
import type { LatLng } from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { CidDisplay, Icon } from "@crm/ui";
import type { ReactElement } from "react";
import { SourceLink } from "./SourceLink.js";
import { whyLead } from "./whyLead.js";
import styles from "./WhyPanel.module.css";

export interface WhyBodyProps {
  readonly property: Provenanced<CrmProperty>;
  readonly permits?: readonly Provenanced<CrmPermit>[] | undefined;
  readonly center?: LatLng | undefined;
  readonly radiusMi?: number | undefined;
  readonly centreLabel?: string | undefined;
  /** CountyLens base URL for Verify CID; absent, the action says the link is not available. */
  readonly countyLensUrl?: string | null | undefined;
  /** Adds the "Details" action (the results pane's panel; the drawer is already the details). */
  readonly onDetails?: ((propertyCid: string) => void) | undefined;
}

export function WhyBody({
  property,
  permits,
  center,
  radiusMi,
  centreLabel,
  countyLensUrl,
  onDetails,
}: WhyBodyProps): ReactElement {
  const countyLens = countyLensUrl?.replace(/\/$/, "");
  const why = whyLead({ property, permits, center, radiusMi, centreLabel });
  return (
    <>
      {why.rules.length === 0 ? (
        <p className={styles.none} data-why-empty="">
          No lead signal in the published data: no roof age, and no open or stalled roofing permit.
        </p>
      ) : (
        <ul className={styles.rules}>
          {why.rules.map((rule) => (
            <li key={rule.key} className={styles.rule} data-why-rule={rule.key}>
              <Icon name="check_circle" size="small" />
              <div className={styles.body}>
                <b>{rule.rule}</b>
                <span>{rule.value}</span>
                <span className={styles.prov}>
                  {rule.source} · <CidDisplay cid={rule.cid} />
                </span>
                {rule.link === undefined ? null : (
                  <a
                    href={rule.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-field="bbb_url"
                  >
                    {rule.link.label}
                    <span className={styles.sr}> (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {why.coordinates === null ? (
        <p className={styles.none} data-why-coordinates="none">
          Coordinates not published for this property.
        </p>
      ) : (
        <div className={styles.rule} data-why-coordinates="">
          <Icon name="my_location" size="small" />
          <div className={styles.body}>
            <b>Coordinates</b>
            <span>{why.coordinates.text}</span>
            <span className={styles.prov}>
              {why.coordinates.source}
              {why.coordinates.direction === null ? "" : ` · ${why.coordinates.direction}`}
              {" · "}
              <a href={why.coordinates.osmUrl} target="_blank" rel="noopener noreferrer">
                Open in OpenStreetMap
                <span className={styles.sr}> (opens in a new tab)</span>
              </a>
              {why.coordinates.sourceUrl === null ? null : (
                <>
                  {" · "}
                  <SourceLink url={why.coordinates.sourceUrl} label="source record" />
                </>
              )}
            </span>
          </div>
        </div>
      )}
      <div className={styles.actions}>
        {countyLens === undefined ? (
          <span className={styles.unavailable} data-why-verify="unavailable">
            <Icon name="verified" size="medium" />
            Verify CID · link not available
          </span>
        ) : (
          <a
            className={styles.action}
            // Task A's Verify page takes a run manifest or a published file, not a record's own CID
            // ("is not a manifest or an artifact of any published run"), so it checks the manifest
            // this record is listed in.
            href={`${countyLens}/data/verify/${encodeURIComponent(property.sourceManifestCid)}`}
            title="Checks the run manifest this record comes from"
            target="_blank"
            rel="noopener noreferrer"
            data-why-verify=""
          >
            <Icon name="verified" size="medium" />
            Verify CID
            <span className={styles.sr}> (opens in a new tab)</span>
          </a>
        )}
        {onDetails === undefined ? null : (
          <button
            type="button"
            className={styles.action}
            onClick={() => onDetails(property.propertyCid)}
            data-why-details=""
          >
            <Icon name="info" size="medium" />
            Details
          </button>
        )}
      </div>
    </>
  );
}
