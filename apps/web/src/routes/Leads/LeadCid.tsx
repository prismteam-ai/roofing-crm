// A CID with its own copy button, named by which id it is ("Copy snapshot manifest CID"), so a
// page with several ids gives a screen reader distinct buttons. Same look and data hooks as the
// shared CidDisplay (`data-cid`, `title`, the 48 px target); the label is the only difference,
// and the shared component has no way to set it.
import { Icon } from "@crm/ui";
import { useCallback, type ReactElement } from "react";
import styles from "./Leads.module.css";

/** `bafybeig…q4xa` becomes `bafy…q4xa`; a value too short to truncate is shown whole. */
export function truncateCid(cid: string): string {
  return cid.length <= 9 ? cid : `${cid.slice(0, 4)}…${cid.slice(-4)}`;
}

export function LeadCid({
  cid,
  label,
}: {
  readonly cid: string;
  /** Which id this is, in words: "snapshot manifest", "current run manifest". */
  readonly label: string;
}): ReactElement {
  const copy = useCallback(() => {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (clipboard === undefined) return;
    void clipboard.writeText(cid).catch(() => undefined);
  }, [cid]);
  return (
    <span className={styles.cid} data-cid={cid} title={cid}>
      <code className={styles.cidText}>{truncateCid(cid)}</code>
      <button
        type="button"
        className={styles.cidCopy}
        onClick={copy}
        aria-label={`Copy ${label} CID`}
      >
        <Icon name="content_copy" size="medium" />
      </button>
    </span>
  );
}
