# Known limitations

- Acquisition is partial across Oakland sources. A 490,799-ID public baseline
  and 63-feature place inventory do not establish complete permit enrichment.
- The current Independence cohort has literal CLOSED roof observations and zero
  canonical OPEN permits. Issued, finaled, expired and other statuses do not
  silently become open/closed. Missing lifecycle dates prevent duration claims.
- Building-year data is low-confidence roof-age context, not a verified roof
  replacement. Only-unknown roof filtering lacks a distinct typed predicate.
- Recorded owner mailing-state classes are not current residence or city-local
  identity. Partial reported sales cannot establish uninterrupted tenure.
- Troy reported applicant/license attachments do not verify contractor role or
  active license eligibility. Missing verified company and BBB evidence remain
  conditional unknowns. Numeric/grade rating filters are unsupported.
- Place resolution covers eligible official Oakland records only. Ambiguous or
  quarantined identities refuse. A center-radius search is not polygon
  containment. Non-mile units and unsupported language require clarification.
- The compositional parser has a finite grammar. Unrecognized material text is
  refused, and false refusals remain possible. The corpus and mutation checks
  are bounded evidence, not a universal natural-language correctness proof.
- The model context may fit fewer rows than the returned page. Selection is a
  bounded presentation, not complete match coverage. Empty and fallback modes
  are not model successes.
- Historical CID1/CID2 represent an assessment product snapshot. Local Elephant
  validation/hash/export or an unmerged Atlas page is not global publication.
- Local/unit/emulator/browser fixtures do not substitute for clean final hosted
  tests, actual concurrency reads, source rights checks, live-model accounting,
  security review, independent review or evaluator first-use validation.
- No final media recording/upload or remote Git publication is permitted until
  the applicable direct Human and review gates are satisfied.
