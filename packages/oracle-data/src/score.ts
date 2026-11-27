import type { LeadCandidate } from "@crm/shared";

const POOR_BBB = new Set(["D+", "D", "D-", "F"]);

/**
 * Lead score (plan Task 2):
 * - roof age ≥ threshold: +40, plus 2 per year over it (cap 20);
 * - any open roofing permit: +30, plus 5 per full open year of the longest (cap 25);
 * - a permit's contractor has a D/F BBB grade, or a DBPR primary status other than C (Current): +10.
 */
export function scoreCandidate(
  c: Omit<LeadCandidate, "score" | "reasons">,
  opts: { minRoofAgeYears: number },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (c.roofAgeYears !== null && c.roofAgeYears >= opts.minRoofAgeYears) {
    score += 40 + Math.min(2 * (c.roofAgeYears - opts.minRoofAgeYears), 20);
    reasons.push(
      `Roof ${c.roofAgeYears} years old (threshold ${opts.minRoofAgeYears}; basis: ${c.roofAgeBasis.replace("_", " ")})`,
    );
  }
  const open = c.openRoofPermits.filter((p) => p.status === "open");
  if (open.length) {
    const days = Math.max(...open.map((p) => p.openDays ?? 0));
    const years = Math.floor(days / 365.25);
    score += 30 + Math.min(5 * years, 25);
    reasons.push(
      open.length === 1
        ? `Roofing permit open ${years >= 1 ? `${years} year${years > 1 ? "s" : ""}` : `${days} days`}`
        : `${open.length} open roofing permits, longest open ${years} year${years === 1 ? "" : "s"}`,
    );
  }
  const flagged = c.openRoofPermits.find(
    (p) =>
      (p.bbbGrade && POOR_BBB.has(p.bbbGrade)) ||
      (p.contractorLicenseStatus !== null && !/^C\b/i.test(p.contractorLicenseStatus)),
  );
  if (flagged) {
    score += 10;
    reasons.push(
      flagged.bbbGrade && POOR_BBB.has(flagged.bbbGrade)
        ? `Contractor ${flagged.contractorName ?? "on the permit"} has BBB grade ${flagged.bbbGrade}`
        : `Contractor ${flagged.contractorName ?? "on the permit"} DBPR license status ${flagged.contractorLicenseStatus} (not C, current)`,
    );
  }
  return { score, reasons };
}
