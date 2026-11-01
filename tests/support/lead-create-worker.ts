import { LeadStore } from "../../packages/lead-domain/src/index";
const file = process.argv[2];
if (!file) throw new Error("Database path missing");
const store = new LeadStore(file, () => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
  return "2026-10-26T12:00:00.000Z";
});
process.send?.({ ready: true });
process.on("message", (message: unknown) => {
  if (message !== "go") return;
  try {
    const lead = store.create({
      sessionId: "shared-race",
      propertyId: "SYN-RACE-1",
      snapshotId: "demo-oakland-v1",
      idempotencyKey: "shared-request",
    });
    store.close();
    process.send?.({ id: lead.id }, () => process.exit(0));
  } catch (error) {
    store.close();
    process.send?.({ error: (error as Error).message }, () => process.exit(1));
  }
});
