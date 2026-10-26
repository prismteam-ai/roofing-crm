// T019 (data-model.md "Session (client-held, Cognito-issued)"): the session shape both apps/web
// (stores it) and apps/api (never reads it directly — the API Gateway JWT authorizer validates
// the bearer token before any Lambda sees it) agree on. No CRM-owned table backs this; it is
// entirely Cognito + browser storage (data-model.md).
import { z } from "zod";

export const Session = z.object({
  idToken: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Epoch milliseconds. An expired session with no valid refresh returns the rep to sign-in. */
  expiresAt: z.number().int().positive(),
});
export type Session = z.infer<typeof Session>;
