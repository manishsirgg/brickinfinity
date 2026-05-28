import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

const allow = ["title", "description", "due_at", "status", "priority", "channel", "completed_at", "cancelled_at", "missed_at", "outcome", "metadata"];
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });

    const b = await req.json();
    const patch: any = Object.fromEntries(Object.entries(b ?? {}).filter(([k]) => allow.includes(k)));
    if (patch.status === "completed") {
      if (!patch.completed_at) patch.completed_at = new Date().toISOString();
      patch.cancelled_at = null;
      patch.missed_at = null;
    }
    if (patch.status === "cancelled") {
      if (!patch.cancelled_at) patch.cancelled_at = new Date().toISOString();
      patch.completed_at = null;
      patch.missed_at = null;
    }
    if (patch.status === "missed") {
      if (!patch.missed_at) patch.missed_at = new Date().toISOString();
      patch.completed_at = null;
      patch.cancelled_at = null;
    }

    const { data, error } = await c.supabase
      .from("seller_crm_followups")
      .update({ ...patch, updated_by: c.sellerId })
      .eq("id", id)
      .eq("seller_id", c.sellerId)
      .select("*")
      .maybeSingle();

    if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Not found" }, { status: 400 });

    if (patch.status === "completed") {
      await c.supabase.from("seller_crm_activities").insert({
        seller_id: c.sellerId,
        contact_id: data.contact_id,
        deal_id: data.deal_id,
        property_id: data.property_id,
        activity_type: "followup_completed",
        channel: "system",
        title: "Follow-up completed",
        body: data.outcome || data.title,
        created_by: c.sellerId,
      });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[seller-crm/followup]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });

    const { error } = await c.supabase.from("seller_crm_followups").delete().eq("id", id).eq("seller_id", c.sellerId);
    if (error) return NextResponse.json({ ok: false, error: "Unable to delete follow-up right now." }, { status: 400 });
    return NextResponse.json({ ok: true, data: true });
  } catch (e) {
    console.error("[seller-crm/followup]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
