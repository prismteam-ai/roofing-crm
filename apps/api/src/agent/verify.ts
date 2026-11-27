/** San Diego APNs: 10 digits, written 123-456-78-90 or 1234567890. */
// Not part of a longer token: permit numbers such as PDS1992-C-9204551999 also contain 10 digits.
const APN_PATTERN = /(?<![\w-])(\d{3}-\d{3}-\d{2}-\d{2}|\d{10})(?![\w-])/g;

export const normalizeApn = (apn: string): string => apn.replace(/\D/g, '');

/**
 * The check on the checker: every parcel number the model wrote must have come back from a
 * tool in this conversation. Returns the ones that did not. Deterministic, no model involved.
 */
export function findUnsupportedApns(answer: string, retrievedApns: ReadonlySet<string>): string[] {
  const known = new Set([...retrievedApns].map(normalizeApn));
  const unsupported = new Set<string>();
  for (const match of answer.matchAll(APN_PATTERN)) {
    const apn = match[1];
    if (apn !== undefined && !known.has(normalizeApn(apn))) unsupported.add(apn);
  }
  return [...unsupported];
}
