/**
 * Keep-warm target. A schedule calls this every few minutes so a visitor does not wait
 * for a cold start. The short pause makes simultaneous calls land on separate instances.
 */
async function warm() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return Response.json({ status: "warm" });
}

export const GET = warm;
export const POST = warm;
