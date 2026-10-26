// T016 (B-03, US1): the 0.5-25 mi radius control (FR-001, data-model.md). A value outside the
// bound is rejected at the control — the radius stays at its previous value and no onChange
// fires (testplans/B-03-test-cases.md TC-002) — never silently clamped into a different number.
import { useId, useState, type KeyboardEvent, type ReactElement } from "react";
import { MAX_RADIUS_MI, MIN_RADIUS_MI, RADIUS_STEP_MI } from "@crm/domain";
import styles from "./RadiusControl.module.css";

// Re-exported under this component's own names so existing callers are unaffected — the values
// themselves now come from `packages/domain`'s single 0.5-25 mi source of truth, not a repeated
// literal (found in review, CR-B-03).
export const RADIUS_MIN_MI = MIN_RADIUS_MI;
export const RADIUS_MAX_MI = MAX_RADIUS_MI;

export interface RadiusControlProps {
  readonly radiusMi: number;
  readonly onChange: (radiusMi: number) => void;
  readonly min?: number;
  readonly max?: number;
  /** Where the search starts, for the caption "From {originLabel} · all query modes" (boards
   *  CrmMap768 / CrmMapPin390): "the pin", "your location (GPS)". Omitted renders no caption. */
  readonly originLabel?: string;
}

function parseRadius(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

export function RadiusControl({
  radiusMi,
  onChange,
  min = RADIUS_MIN_MI,
  max = RADIUS_MAX_MI,
  originLabel,
}: RadiusControlProps): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  const commit = (raw: string): void => {
    const parsed = parseRadius(raw, min, max);
    if (parsed === null) {
      // Rejected: the radius stays at its previous value, no onChange fires, no request is sent
      // (TC-002) — the draft is cleared so the input snaps back to the last accepted value.
      setRejected(true);
      setDraft(null);
      return;
    }
    setRejected(false);
    setDraft(null);
    onChange(parsed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget.value);
    }
  };

  return (
    <div
      className={styles.card}
      {...(originLabel === undefined ? {} : { title: `From ${originLabel} · all query modes` })}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          Radius
        </label>
        <span className={styles.inputRow}>
          <input
            type="range"
            className={styles.slider}
            step={RADIUS_STEP_MI}
            min={min}
            max={max}
            value={radiusMi}
            aria-label="Radius (slider)"
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <input
            id={id}
            className={styles.input}
            type="number"
            inputMode="decimal"
            step={RADIUS_STEP_MI}
            min={min}
            max={max}
            value={draft ?? String(radiusMi)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className={styles.unit}>mi</span>
        </span>
        {rejected ? (
          <p role="alert" className={styles.hint}>
            {`Radius must be between ${min} and ${max} mi`}
          </p>
        ) : null}
      </div>
      {originLabel === undefined ? null : (
        <p className={styles.origin}>{`From ${originLabel} · all query modes`}</p>
      )}
    </div>
  );
}
