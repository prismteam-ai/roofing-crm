// B-07 pure lead rules (data-model.md, architecture-constitution.md §5/§9). No I/O.

/** Dedupe key for a lead: `{fips}:tcad:{request_identifier}`. Never `property_cid` (ADR-04, P0-6). */
export function leadKey(fips: string, requestIdentifier: string): string {
  if (fips === "" || requestIdentifier === "") {
    throw new Error("leadKey requires a non-empty fips and request identifier");
  }
  return `${fips}:tcad:${requestIdentifier}`;
}

const TCAD_MARKER = ":tcad:";

/** Request identifier of a lead key: everything after the FIRST ":tcad:", so an identifier that
 *  itself contains ":tcad:" is kept whole. Empty string when the key has no marker. */
export function requestIdentifierOf(key: string): string {
  const at = key.indexOf(TCAD_MARKER);
  return at === -1 ? "" : key.slice(at + TCAD_MARKER.length);
}

/** Cheap pre-check: the lead was captured under a different manifest than the one now served.
 *  This alone does NOT decide AC-5 ("not in the current run"); the service also requires the
 *  lead's property to be absent from the current index. Computed at read time, never stored. */
export function isNotInCurrentRun(sourceManifestCid: string, currentManifestCid: string): boolean {
  return sourceManifestCid !== currentManifestCid;
}
