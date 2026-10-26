// B-07: how the lead screens read a failed lookup. tRPC puts the error code on `data.code`.

/** True for a tRPC NOT_FOUND: the lead id does not exist (not a transient failure). */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { data?: { code?: unknown } }).data?.code === "NOT_FOUND";
}

/** Retry policy for the lead lookup: a missing lead stays missing, so never retry it; retry any
 *  other failure once (a dropped connection or a throttled call). */
export function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
  return !isNotFoundError(error) && failureCount < 1;
}

/** True for the API's STALE_SEQUENCE conflict: someone else changed the lead since it was loaded
 *  (`data.appCode`, set by the API's errorFormatter). */
export function isStaleError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { data?: { appCode?: unknown } }).data?.appCode === "STALE_SEQUENCE";
}

/** Shown (not as an error) after "Assign to me" lost a race and the lead was refetched. */
export const STALE_ASSIGN_COPY =
  "This lead changed while you were looking. It is shown as it is now.";

/** The headline for a failed "Assign to me" that is not a stale conflict. */
export function assignErrorCopy(error: unknown): string {
  return isNotFoundError(error)
    ? "This lead no longer exists, so it can't be assigned."
    : "Couldn't assign the lead.";
}
