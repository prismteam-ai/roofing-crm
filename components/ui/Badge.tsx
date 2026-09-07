import type { LeadSignal } from "@/lib/queries/types";

const SIGNAL_STYLES: Record<LeadSignal, string> = {
  long_open_permit: "bg-red-100 text-red-800 border-red-200",
  open_permit: "bg-orange-100 text-orange-800 border-orange-200",
  aged_roof: "bg-yellow-100 text-yellow-800 border-yellow-200",
  none: "bg-gray-100 text-gray-600 border-gray-200",
};

export const SIGNAL_LABELS: Record<LeadSignal, string> = {
  long_open_permit: "Long-open permit",
  open_permit: "Open permit",
  aged_roof: "Aged roof",
  none: "No signal",
};

/** Small coloured pill for a lead signal. */
export function SignalBadge({
  signal,
  children,
}: {
  signal: LeadSignal;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SIGNAL_STYLES[signal]}`}
    >
      {children ?? SIGNAL_LABELS[signal]}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  contacted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  qualified: "bg-amber-50 text-amber-800 border-amber-200",
  quoted: "bg-purple-50 text-purple-700 border-purple-200",
  won: "bg-green-50 text-green-700 border-green-200",
  lost: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Pill for a lead status. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.lost}`}
    >
      {status}
    </span>
  );
}

/** Generic neutral pill. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "good";
}) {
  const cls =
    tone === "warn"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : tone === "good"
        ? "bg-green-50 text-green-700 border-green-200"
        : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}
