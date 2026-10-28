import { createHash } from "node:crypto";
import {
  DomainError,
  QuerySchema,
  type QueryInput,
} from "../../contracts/src/index";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function boundedToolArguments(input: unknown, expected: QueryInput) {
  const parsed = QuerySchema.safeParse(input);
  if (!parsed.success)
    throw new DomainError(
      "INVALID_INPUT",
      "Provider supplied invalid typed search arguments",
    );
  const given = parsed.data,
    fixed = QuerySchema.parse(expected);
  if (
    given.snapshotId !== fixed.snapshotId ||
    given.lat !== fixed.lat ||
    given.lng !== fixed.lng ||
    given.placeId !== fixed.placeId ||
    given.placeIndexDigest !== fixed.placeIndexDigest ||
    given.sort !== fixed.sort ||
    given.cursor
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Provider crossed the fixed snapshot, map center or cursor boundary",
    );
  if ((given.minOwnershipYears ?? 0) > 0)
    throw new DomainError(
      "UNSUPPORTED_TOOL",
      "Complete ownership tenure is unavailable to this assistant; reported-sale age is a separate supported observation.",
    );
  const ranks = { any: 0, low: 1, medium: 2, high: 3 };
  if (
    (fixed.permitStatus !== "any" &&
      given.permitStatus !== fixed.permitStatus) ||
    given.minOpenDays < fixed.minOpenDays ||
    (fixed.roofMinAgeYears !== undefined &&
      (given.roofMinAgeYears === undefined ||
        given.roofMinAgeYears < fixed.roofMinAgeYears)) ||
    (fixed.ownerRegion &&
      fixed.ownerRegion !== "any" &&
      given.ownerRegion !== fixed.ownerRegion) ||
    (fixed.minOwnershipYears !== undefined &&
      (given.minOwnershipYears ?? -1) < fixed.minOwnershipYears) ||
    (fixed.providerPermitStatus !== undefined &&
      given.providerPermitStatus !== fixed.providerPermitStatus) ||
    (fixed.permitActivityClaim !== undefined &&
      given.permitActivityClaim !== fixed.permitActivityClaim) ||
    (fixed.minPermitAgeSinceIssueDays !== undefined &&
      (given.minPermitAgeSinceIssueDays ?? -1) <
        fixed.minPermitAgeSinceIssueDays) ||
    (fixed.minRecordedDeedGapYears !== undefined &&
      (given.minRecordedDeedGapYears ?? -1) < fixed.minRecordedDeedGapYears) ||
    (fixed.minReportedSaleAgeYears !== undefined &&
      (given.minReportedSaleAgeYears ?? -1) < fixed.minReportedSaleAgeYears) ||
    ranks[given.minConfidence] < ranks[fixed.minConfidence] ||
    (given.includeUnknown && !fixed.includeUnknown) ||
    (fixed.requiresContractor && !given.requiresContractor) ||
    (fixed.requiresVerifiedLicense && !given.requiresVerifiedLicense) ||
    (fixed.requiresBbbRating && !given.requiresBbbRating)
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Provider weakened the user's evidence predicates",
    );
  if (given.radiusMeters !== fixed.radiusMeters || given.limit !== fixed.limit)
    throw new DomainError(
      "INVALID_INPUT",
      "Provider changed an explicitly validated radius or limit",
    );
  const clampedFields: string[] = [];
  const query = given;
  return { query, clampedFields, providerArgumentsDigest: hash(given) };
}
