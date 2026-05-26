import { NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

export async function GET() {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { supabase, sellerId } = ctx;
    const [{ data: dashboard }, { data: deals }, { data: followups }] = await Promise.all([
      supabase.from("seller_crm_dashboard_summary").select("*").eq("seller_id", sellerId).maybeSingle(),
      supabase.from("seller_crm_deal_summary").select("*").eq("seller_id", sellerId).maybeSingle(),
      supabase.from("seller_crm_followup_summary").select("*").eq("seller_id", sellerId).maybeSingle(),
    ]);
    return NextResponse.json({ ok: true, data: { dashboard: dashboard ?? null, deals: deals ?? null, followups: followups ?? null } });
  } catch (error) {
    console.error("[seller-crm]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
