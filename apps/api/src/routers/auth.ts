// Found deploying (not in the original T005-TN02 scope): Cognito's PreAuthentication trigger
// can't observe a failed password (see auth/lockout-handler.ts's module header for the full
// design). This public, unauthenticated procedure is the client-reported half of the fix —
// apps/web calls it when Cognito's own SRP sign-in throws NotAuthorizedException, so a failed
// attempt actually increments data-model.md's LockoutCounter. Public by necessity (called before
// any session exists, same as health.ping) and client-reported, hence spoofable in principle;
// accepted for this story (one shared admin login, no public attacker surface worth hardening
// against here) — decided with the user rather than assumed.
import { z } from "zod";
import { lockoutKey, recordFailedAttempt } from "../auth/lockout-handler.js";
import { createDynamoLockoutStore, type LockoutStore } from "../auth/lockout-store.js";
import { publicProcedure, router } from "../trpc.js";

let cachedStore: LockoutStore | undefined;
function lockoutStore(): LockoutStore {
  if (cachedStore === undefined) {
    const tableName = process.env.LOCKOUT_TABLE_NAME;
    if (tableName === undefined || tableName === "") {
      throw new Error("LOCKOUT_TABLE_NAME is not set");
    }
    cachedStore = createDynamoLockoutStore(tableName);
  }
  return cachedStore;
}

export const authRouter = router({
  reportFailedAttempt: publicProcedure
    .input(z.object({ username: z.string().min(1) }))
    .output(z.object({ ok: z.literal(true), locked: z.boolean() }))
    .mutation(async ({ input }) => {
      const counter = await recordFailedAttempt(lockoutStore(), lockoutKey(input.username));
      // `locked` tells the client this exact attempt just crossed the 4th-failure threshold, so
      // it can show the typed lockout message immediately (AC-3) instead of waiting for a 5th
      // attempt to hit the PreAuthentication gate — see lockout-handler.ts's recordFailedAttempt.
      return { ok: true as const, locked: counter.lockedUntil !== null };
    }),
});
