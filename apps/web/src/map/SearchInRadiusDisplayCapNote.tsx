import type { JSX } from "react";

import {
  SEARCH_IN_RADIUS_DISPLAY_CAP_OPTIONS,
  SEARCH_IN_RADIUS_NEAREST_CAP_PREFIX,
  SEARCH_IN_RADIUS_NEAREST_CAP_SUFFIX,
} from "./search-in-radius-display-cap";

export interface SearchInRadiusDisplayCapNoteProps {
  displayCap: number;
  onDisplayCapChange: (displayCap: number) => void;
}

/**
 * Inline roofs-sheet note with the display-cap select embedded in the sentence.
 */
export function SearchInRadiusDisplayCapNote({
  displayCap,
  onDisplayCapChange,
}: SearchInRadiusDisplayCapNoteProps): JSX.Element {
  return (
    <p
      className="text-[0.65rem] leading-snug text-muted-foreground"
      data-testid="search-in-radius-display-cap-note"
    >
      {SEARCH_IN_RADIUS_NEAREST_CAP_PREFIX}{" "}
      <select
        className="inline rounded-sm border border-foreground/50 bg-transparent px-1 py-0 text-[0.65rem] tabular-nums text-foreground align-baseline"
        value={displayCap}
        aria-label="Maximum roofs to show"
        data-testid="search-in-radius-display-cap-select"
        onChange={(event) => {
          onDisplayCapChange(Number(event.target.value));
        }}
      >
        {SEARCH_IN_RADIUS_DISPLAY_CAP_OPTIONS.map((capOption) => (
          <option key={capOption} value={capOption}>
            {capOption}
          </option>
        ))}
      </select>{" "}
      {SEARCH_IN_RADIUS_NEAREST_CAP_SUFFIX}
    </p>
  );
}
