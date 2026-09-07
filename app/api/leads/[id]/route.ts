import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/http";
import { deleteLead, getLead, updateLeadStatus } from "@/lib/db/leads";
import { LEAD_STATUSES } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.coerce.number().int().positive();

/** GET /api/leads/:id */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const lead = await getLead(idSchema.parse((await ctx.params).id));
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (err) {
    return jsonError(err);
  }
}

const patchSchema = z.object({ status: z.enum(LEAD_STATUSES) });

/** PATCH /api/leads/:id { status } */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const id = idSchema.parse((await ctx.params).id);
    const { status } = patchSchema.parse(await req.json());
    const lead = await updateLeadStatus(id, status);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json(lead);
  } catch (err) {
    return jsonError(err);
  }
}

/** DELETE /api/leads/:id */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const ok = await deleteLead(idSchema.parse((await ctx.params).id));
    if (!ok) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
