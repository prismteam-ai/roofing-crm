// A link to the source record Task A published for a row (contract v1.1 `source_url`: a TCAD file
// for a property, an Austin open-data record for a permit). Only an http(s) URL is ever rendered
// as a link: anything else (javascript:, data:, a relative string) renders nothing, so the caller
// shows the stated missing reason instead. Same approach as BbbLink.
import type { ReactElement } from "react";

export function safeSourceHref(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function SourceLink({
  url,
  label,
}: {
  readonly url?: string | null | undefined;
  readonly label: string;
}): ReactElement | null {
  const href = safeSourceHref(url);
  if (href === null) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-field="source_url"
      aria-label={`${label} (opens in a new tab)`}
    >
      {label}
    </a>
  );
}
