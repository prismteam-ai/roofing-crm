// TD-6: @crm/sync unit tests never reach the network. Any `fetch` a test has not stubbed fails
// at once with the URL it tried, instead of silently depending on a public IPFS gateway's
// latency. Tests stub `fetch` themselves (see fixtures/sampleManifest.ts) and restore this guard
// afterwards. The AWS SDK clients are mocked with aws-sdk-client-mock and never use `fetch`.
const guard: typeof fetch = (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return Promise.reject(
    new Error(`@crm/sync unit tests must not use the network (unstubbed fetch of ${url})`),
  );
};

globalThis.fetch = guard;
