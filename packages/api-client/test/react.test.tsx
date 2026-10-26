// TD-5: the React Query integration (src/react.tsx) was built ahead of need (A-03 T009's
// pattern) but never actually wired into any route yet in this repo, so it had 0% coverage —
// genuinely unexercised, not just under-tested. Covers it for real: createQueryClient's config,
// and ApiProvider actually rendering and exposing a working client through context.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index.js";
import { ApiProvider, createQueryClient, useTRPCClient } from "../src/react.js";

describe("createQueryClient", () => {
  it("retries once, never refetches on window focus, and treats data as fresh for 60s", () => {
    const queryClient = createQueryClient();
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.staleTime).toBe(60_000);
  });
});

describe("ApiProvider", () => {
  it("renders its children and provides a working client through useTRPCClient", () => {
    const injectedClient = createApiClient();
    const injectedQueryClient = createQueryClient();
    let seenClient: unknown;

    function Probe(): null {
      seenClient = useTRPCClient();
      return null;
    }

    const html = renderToStaticMarkup(
      <ApiProvider client={injectedClient} queryClient={injectedQueryClient}>
        <span>probe</span>
        <Probe />
      </ApiProvider>,
    );

    expect(html).toContain("probe");
    expect(seenClient).toBe(injectedClient);
  });

  it("falls back to creating its own client and query client when none are injected", () => {
    let seenClient: unknown;
    function Probe(): null {
      seenClient = useTRPCClient();
      return null;
    }
    renderToStaticMarkup(
      <ApiProvider>
        <Probe />
      </ApiProvider>,
    );
    expect(seenClient).toBeDefined();
  });
});
