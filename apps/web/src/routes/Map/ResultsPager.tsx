// The numbered pager under a page of match rows ("Showing 1–10 of the nearest 100", previous,
// page numbers, next). Shared by the filter results and the Ask AI matches, so both page the same.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import { pageNumbers, type PageSlice } from "./resultsView.js";
import styles from "./ResultsList.module.css";

export function ResultsPager({
  slice,
  showing,
  onPage,
}: {
  readonly slice: PageSlice;
  readonly showing: string;
  readonly onPage: (page: number) => void;
}): ReactElement {
  return (
    <footer className={styles.foot} data-results-pager="">
      <span className={styles.showing}>{showing}</span>
      <nav className={styles.pager} aria-label="Pages">
        <button
          type="button"
          className={styles.pageBtn}
          aria-label="Previous page"
          disabled={slice.page <= 1}
          onClick={() => onPage(slice.page - 1)}
        >
          <Icon name="chevron_left" size="medium" />
        </button>
        {pageNumbers(slice.page, slice.pages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${String(index)}`} className={styles.gap} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`${styles.pageBtn} ${item === slice.page ? styles.pageOn : ""}`}
              aria-label={`Page ${String(item)}`}
              {...(item === slice.page ? { "aria-current": "page" as const } : {})}
              onClick={() => onPage(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          className={styles.pageBtn}
          aria-label="Next page"
          disabled={slice.page >= slice.pages}
          onClick={() => onPage(slice.page + 1)}
        >
          <Icon name="chevron_right" size="medium" />
        </button>
      </nav>
    </footer>
  );
}
