import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetDismissedForPage } from "../src/components/Onboarding/firstVisit.js";

// The first-visit card remembers a dismissal in the page, localStorage and sessionStorage; a test
// must not inherit the previous test's.
afterEach(() => {
  resetDismissedForPage();
  try {
    sessionStorage.clear();
    localStorage.clear();
  } catch {
    // No sessionStorage in this environment.
  }
});
