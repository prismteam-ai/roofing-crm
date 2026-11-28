import { allowedTransitions, type LeadStatus } from "@crm/leads-db/schema";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

/** Only the transitions the lead lifecycle allows from the current status. */
export function StatusControl({
  status,
  onChange,
  disabled,
}: {
  status: LeadStatus;
  onChange(to: LeadStatus): void;
  disabled?: boolean;
}) {
  const next = allowedTransitions(status);
  return (
    <label className="status-control">
      Status: <strong>{STATUS_LABEL[status]}</strong>
      {next.length ? (
        <select
          aria-label="Change status"
          value=""
          disabled={disabled}
          onChange={(e) => e.target.value && onChange(e.target.value as LeadStatus)}
        >
          <option value="">Move to…</option>
          {next.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      ) : (
        <span className="muted"> (final)</span>
      )}
    </label>
  );
}
