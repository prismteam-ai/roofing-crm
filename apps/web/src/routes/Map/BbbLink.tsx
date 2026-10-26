// The BBB search link Task A builds from the contractor name as printed on the permit (contract
// v1.1 `bbb_url`). It is a search, never a rating: BBB blocks automated lookups, so no rating is
// published. Task A's link carried `find_type=Category`, which returned only ads (PO checked by
// hand, Task A 2026-10-26); the parameter is dropped here too, so an index built before that fix
// still links to the working search. Only an https URL is ever rendered as a link.
import type { ReactElement } from "react";

export function bbbHref(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("find_type");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function BbbLink({
  url,
  label = "Search BBB for this contractor",
}: {
  readonly url?: string | null | undefined;
  readonly label?: string;
}): ReactElement | null {
  const href = bbbHref(url);
  if (href === null) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-field="bbb_url"
      aria-label={`${label} (opens in a new tab)`}
    >
      {label}
    </a>
  );
}
