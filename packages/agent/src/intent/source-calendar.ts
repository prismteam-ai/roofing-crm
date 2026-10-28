import { z } from "zod";
import { sourceCalendarAnniversary } from "../../../contracts/src/source-observations";
import { SOURCE_ASSESSMENT_DATE } from "../../../runtime-config/src/source-assessment";
export { SOURCE_ASSESSMENT_DATE };
/** Calendar anniversaries, including leap-day month ends, are derived from the pinned source assessment date. */
export function calendarAgeThresholdDays(
  assessmentDate: string,
  years: number,
  strict = true,
): number {
  z.iso.date().parse(assessmentDate);
  if (!Number.isSafeInteger(years) || years < 0 || years > 200)
    throw new Error("Invalid calendar-year threshold");
  const cutoff = sourceCalendarAnniversary(assessmentDate, -years);
  const days =
    Math.floor((Date.parse(assessmentDate) - Date.parse(cutoff)) / 86400000) +
    (strict ? 1 : 0);
  if (days > 50000)
    throw new Error("Calendar threshold exceeds the bounded day predicate");
  return days;
}
