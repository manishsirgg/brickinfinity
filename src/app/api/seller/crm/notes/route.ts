import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

async function assertOwnership(ctx: Awaited<ReturnType<typeof resolveSellerCrmContext>> & { ok: true }, table: string, id: string, label: string) {
  const { data } = await ctx.supabase.from(table).select("id").eq("id", id).eq("seller_id", ctx.sellerId).maybeSingle();
  if (!data) throw new Error(`Invalid ${label}`);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const sp = req.nextUrl.searchParams;
    let q = ctx.supabase.from("seller_crm_notes").select("*").eq("seller_id", ctx.sellerId);
    const contactId = sp.get("contact_id"); const dealId = sp.get("deal_id"); const propertyId = sp.get("property_id");
    if (contactId) q = q.eq("contact_id", contactId);
    if (dealId) q = q.eq("deal_id", dealId);
    if (propertyId) q = q.eq("property_id", propertyId);
    const { data, error } = await q.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[seller-crm/notes]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const b = await req.json();
    const { seller_id, created_by, updated_by, ...payload } = b ?? {};
    if (!payload.body?.trim()) return NextResponse.json({ ok: false, error: "Note content is required." }, { status: 400 });
    if (!payload.contact_id && !payload.deal_id && !payload.property_id) return NextResponse.json({ ok: false, error: "Please link this note to a contact, deal, or property." }, { status: 400 });
    if (payload.contact_id) await assertOwnership(ctx, "seller_crm_contacts", payload.contact_id, "contact_id");
    if (payload.deal_id) await assertOwnership(ctx, "seller_crm_deals", payload.deal_id, "deal_id");
    if (payload.property_id) await assertOwnership(ctx, "properties", payload.property_id, "property_id");
    const { data, error } = await ctx.supabase.from("seller_crm_notes").insert({
      ...payload, seller_id: ctx.sellerId, created_by: ctx.sellerId, updated_by: ctx.sellerId,
    }).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await ctx.supabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: data.contact_id, deal_id: data.deal_id, property_id: data.property_id, activity_type: "note", channel: "system", title: "Note added", body: data.title || String(data.body).slice(0, 120), created_by: ctx.sellerId });
    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    console.error("[seller-crm/notes]", error);
    return NextResponse.json({ ok: false, error: error.message || "Unexpected error" }, { status: 500 });
  }
}
