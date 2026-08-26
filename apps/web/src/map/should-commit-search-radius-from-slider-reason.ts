/**
 * Slider interaction reason from Base UI (`onValueChange` eventDetails.reason).
 */
export type SearchRadiusSliderReason = string;

/**
 * Live `search.inRadius` should not run on every drag tick — each in-flight call
 * holds a Lambda until API Gateway times out (~29s) and starves leads.archive.
 */
export function shouldCommitSearchRadiusFromSliderReason(
  reason: SearchRadiusSliderReason,
): boolean {
  return reason !== "drag";
}
