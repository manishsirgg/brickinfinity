import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const allow = ["title", "body", "is_pinned", "is_private"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const b = await req.json();
    const patch = Object.fromEntries(Object.entries(b ?? {}).filter(([k]) => allow.includes(k)));
    const { data, error } = await ctx.supabase.from("seller_crm_notes").update({ ...patch, updated_by: ctx.sellerId }).eq("id", id).eq("seller_id", ctx.sellerId).select("*").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[seller-crm/notes]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { error } = await ctx.supabase.from("seller_crm_notes").delete().eq("id", id).eq("seller_id", ctx.sellerId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, data: true });
  } catch (error) {
    console.error("[seller-crm/notes]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
