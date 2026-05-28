import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";
import { isSellerCrmDealStage } from "@/lib/seller-crm/deal-stages";

const allow = ["title", "deal_type", "deal_stage", "property_id", "expected_value", "final_value", "commission_model", "commission_value", "probability", "expected_close_date", "closed_at", "lost_reason", "won_reason", "metadata"];
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  const c = await resolveSellerCrmContext();
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });
  const { data, error } = await c.supabase.from("seller_crm_deals").select("*").eq("id", id).eq("seller_id", c.sellerId).maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });

    const b = await req.json();
    const patch: any = Object.fromEntries(Object.entries(b ?? {}).filter(([k]) => allow.includes(k)));

    if (Object.prototype.hasOwnProperty.call(patch, "deal_stage") && !isSellerCrmDealStage(patch.deal_stage)) {
      return NextResponse.json({ ok: false, error: "Invalid deal_stage value" }, { status: 400 });
    }

    const { data: old } = await c.supabase.from("seller_crm_deals").select("deal_stage,contact_id,property_id").eq("id", id).eq("seller_id", c.sellerId).maybeSingle();
    if (!old) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (patch.property_id) {
      const { data: p } = await c.supabase.from("properties").select("id").eq("id", patch.property_id).eq("seller_id", c.sellerId).maybeSingle();
      if (!p) return NextResponse.json({ ok: false, error: "This property does not belong to your seller account." }, { status: 400 });
    }

    if ((patch.deal_stage === "closed_won" || patch.deal_stage === "closed_lost") && !patch.closed_at) patch.closed_at = new Date().toISOString();

    const { data, error } = await c.supabase.from("seller_crm_deals").update({ ...patch, updated_by: c.sellerId }).eq("id", id).eq("seller_id", c.sellerId).select("*").maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Not found" }, { status: 400 });

    if (old.deal_stage !== data.deal_stage) {
      await c.supabase.from("seller_crm_activities").insert({
        seller_id: c.sellerId,
        deal_id: data.id,
        contact_id: data.contact_id,
        property_id: data.property_id,
        activity_type: "deal_updated",
        channel: "system",
        title: "Deal updated",
        old_value: old.deal_stage,
        new_value: data.deal_stage,
        metadata: { old_stage: old.deal_stage, new_stage: data.deal_stage },
        created_by: c.sellerId,
      });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[seller-crm/deal]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
