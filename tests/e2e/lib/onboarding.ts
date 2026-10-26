// The first-visit "What can I ask?" card (apps/web/src/components/Onboarding/firstVisit.ts)
// opens over the map on a browser that has never dismissed it, which would sit over click
// targets in every spec. Playwright's default storage state therefore starts each context with
// the card already dismissed; `?first=1` still forces it open for the specs that test the card.
// The key and value mirror WHAT_CAN_I_ASK_STORAGE_KEY / markDismissed() in firstVisit.ts.
export const WHAT_CAN_I_ASK_STORAGE_KEY = "crm.whatCanIAsk.v1";

export function onboardingDismissedState(baseURL: string): {
  cookies: [];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
} {
  return {
    cookies: [],
    origins: [
      {
        origin: new URL(baseURL).origin,
        localStorage: [{ name: WHAT_CAN_I_ASK_STORAGE_KEY, value: "dismissed" }],
      },
    ],
  };
}
