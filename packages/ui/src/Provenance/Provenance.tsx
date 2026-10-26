// The Atlas § 8 provenance line (A-03 T055): body-small, on-surface-variant, leading
// `description` icon. For a permit row (plan § "Atlas element map" → Row provenance):
// `Source: {source_url as link} · collected {captured_at} UTC · record {record CID, truncated +
// copy} · run {run_id}` (TC-021); an absent source URL shows the Missing-reason label of its
// `missing` entry when the row has one, else "No source link published", never a blank. The CID is
// the row's own record CID (the CRM index holds no Parquet part CID, so it is not called a table). The generic form renders any children on the same line (the
// Runs card: `Index: this site (/runs/index.json) · Manifest: {CID}`). Render-only: the caller
// picks the values; this file formats them.
import type { ReactElement, ReactNode } from "react";
import type { Missing } from "@crm/oracle-contract";
import { CidDisplay } from "../CidDisplay/CidDisplay";
import { Icon } from "../Icon/Icon";
import { MissingReason } from "../MissingReason/MissingReason";
import styles from "./Provenance.module.css";

/** An ISO 8601 instant as a UTC calendar time, `2026-10-20 14:02:05` (the caller adds "UTC"). */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export interface PermitProvenanceProps {
  /** The row's `source_url`; null when the source published no link. */
  readonly sourceUrl: string | null;
  /** The row's own `missing` entry for `source_url`, if it has one; shown when `sourceUrl` is
   *  null. Without one the line says no link was published, and invents no reason code. */
  readonly sourceUrlMissing?: Missing;
  /** The row's `captured_at` (manifest `sources[].captured_at`). */
  readonly capturedAt: string;
  /** The row's own record CID (`row.cid` / `permit.cid`). */
  readonly recordCid: string;
  /** The row's `run_id` (manifest `runId`). */
  readonly runId: string;
}

export interface GenericProvenanceProps {
  readonly children: ReactNode;
}

export type ProvenanceProps = PermitProvenanceProps | GenericProvenanceProps;

function isGeneric(props: ProvenanceProps): props is GenericProvenanceProps {
  return "children" in props;
}

function PermitLine({
  sourceUrl,
  sourceUrlMissing,
  capturedAt,
  recordCid,
  runId,
}: PermitProvenanceProps): ReactElement {
  return (
    <>
      Source:{" "}
      {sourceUrl === null ? (
        sourceUrlMissing === undefined ? (
          <span data-field="source_url">No source link published</span>
        ) : (
          <MissingReason field={sourceUrlMissing.field} reason={sourceUrlMissing.reason} />
        )
      ) : (
        <a href={sourceUrl} className={styles.link} rel="noopener noreferrer" target="_blank">
          {sourceUrl}
        </a>
      )}
      {" · collected "}
      <time dateTime={capturedAt}>{formatUtc(capturedAt)}</time>
      {" UTC · record "}
      <CidDisplay cid={recordCid} />
      {` · run ${runId}`}
    </>
  );
}

export function Provenance(props: ProvenanceProps): ReactElement {
  return (
    <div className={styles.line}>
      <Icon name="description" size="small" />
      <span className={styles.text}>
        {isGeneric(props) ? props.children : <PermitLine {...props} />}
      </span>
    </div>
  );
}
