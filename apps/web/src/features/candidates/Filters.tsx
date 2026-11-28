import { PermitStatus } from "@crm/shared";

export interface FilterValue {
  minRoofAgeYears: number;
  minOpenYears: number;
  permitStatus: PermitStatus[] | undefined;
}

const STATUS_LABEL: Record<PermitStatus, string> = {
  open: "Open",
  needs_review: "Needs review",
  other: "Other",
  completed: "Completed",
};
/** Open-permit statuses worth filtering on (completed permits are not leads). */
const STATUSES: PermitStatus[] = ["open", "needs_review", "other"];

/** Roof-age threshold, minimum open years and permit status; shared by the map and the Leads page. */
export function Filters({
  value,
  onChange,
  idPrefix = "f",
}: {
  value: FilterValue;
  onChange(v: Partial<FilterValue>): void;
  idPrefix?: string;
}) {
  const checked = (s: PermitStatus) => (value.permitStatus ?? STATUSES).includes(s);
  const toggle = (s: PermitStatus) => {
    const cur = value.permitStatus ?? STATUSES;
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    onChange({ permitStatus: next.length === STATUSES.length ? undefined : next.length ? next : cur });
  };
  return (
    <fieldset className="filters">
      <legend>Filters</legend>
      <label htmlFor={`${idPrefix}-roof`}>
        Roof age ≥{" "}
        <input
          id={`${idPrefix}-roof`}
          type="number"
          min={0}
          max={150}
          value={value.minRoofAgeYears}
          onChange={(e) =>
            onChange({ minRoofAgeYears: Math.max(0, Math.min(150, Number(e.target.value) || 0)) })
          }
        />{" "}
        years
      </label>
      <label htmlFor={`${idPrefix}-open`}>
        Permit open ≥{" "}
        <input
          id={`${idPrefix}-open`}
          type="number"
          min={0}
          max={100}
          step={1}
          value={value.minOpenYears}
          onChange={(e) =>
            onChange({ minOpenYears: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
          }
        />{" "}
        years
      </label>
      <span className="statuses" role="group" aria-label="Permit status">
        Permit status:
        {STATUSES.map((s) => (
          <label key={s}>
            <input type="checkbox" checked={checked(s)} onChange={() => toggle(s)} /> {STATUS_LABEL[s]}
          </label>
        ))}
      </span>
    </fieldset>
  );
}
