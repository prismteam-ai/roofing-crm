import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/http";
import { addLeadNote } from "@/lib/db/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

/** POST /api/leads/:id/activities { body } - add a note. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((await ctx.params).id);
    const { body } = bodySchema.parse(await req.json());
    const activity = await addLeadNote(id, body);
    if (!activity) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
