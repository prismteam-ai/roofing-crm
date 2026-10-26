---
id: ERR-21
type: defect
feature: FEAT-B01
story: B-01
test_case: B-01 sign-in lockout (AC-3)
ac_reference: B-01-AC-3
severity: High
status: Closed
found_by: PO, signing in on the B-09 hosted preview
found_date: 2026-10-24
fix_branch: 009-agent-hardening
fix_commit: 15f3ab9
retest_date: 2026-10-25
---

# ERR-21: Sign-in says "Too many attempts" on the first wrong password

## Brief description

Signing in to the hosted preview as the shared admin showed the lockout message ("Too many attempts — try again in 5 minutes") on a first attempt.

## Related requirement

- **Story:** B-01 · **AC:** B-01-AC-3 (4 failed attempts lock sign-in for 5 minutes; a successful sign-in resets the count)

## Environment

| Item | Value |
| --- | --- |
| URL | https://009-agent-hardening.d1zmhc6kkyzsbe.amplifyapp.com |
| Backend | CrmOps `crm-ops-lockout` trigger, table `crm-lockout-counter`, `auth.reportFailedAttempt` |

## Root cause

The two halves of the lockout used different keys for the same person:

- The web app reports a failed attempt under the email the person typed (`admin@roofing-crm.test`).
- Cognito's PreAuthentication and PostAuthentication triggers receive Cognito's internal sub (`806cb99c-…`) as `userName`, so the lock check and the reset after a successful sign-in used the sub.

A successful sign-in therefore never reset the email's counter. It had reached 17 failures across earlier days, so any single wrong password returned "locked" straight away.

## Fix

`lockoutKey()` in `apps/api/src/auth/lockout-handler.ts`: every path keys the counter by the sign-in email, trimmed and lower-cased. The triggers read `request.userAttributes.email` (falling back to `userName`); `auth.reportFailedAttempt` normalizes the typed username the same way. Tests: `apps/api/test/auth/lockout-handler-envelope.test.ts` (3 new cases, written failing first).

## Retest

After redeploy: sign in with a wrong password once (no lock message), then sign in correctly (counter resets to 0), then 4 wrong attempts (lock message, 5 minutes).

## Retest result (2026-10-25)

Deployed since `15f3ab9`. Hosted check on commit `731b481` (CI run https://github.com/HebaGaber/roofing-crm/actions/runs/40167849532): `tests/e2e/B-01.spec.ts` "AC-3: typed lockout after the 4th consecutive failed attempt" passes on desktop-1440 (the check is skipped on the other viewports on purpose). The stale counter row for the admin was deleted from `crm-lockout-counter` on 2026-10-24. Closed.
