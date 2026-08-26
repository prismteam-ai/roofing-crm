/**
 * Clerk annotation for plat sheets: a caveat, not a field.
 */
import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Props for a plat sheet honesty / caution note.
 */
export interface PlatSheetNoticeProps {
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Title-block note: hairline rules, linen showing through, no input box.
 */
export function PlatSheetNotice({
  children,
  className,
  testId,
}: PlatSheetNoticeProps): JSX.Element {
  return (
    <p role="note" data-testid={testId} className={cn("plat-sheet-notice", className)}>
      {children}
    </p>
  );
}
