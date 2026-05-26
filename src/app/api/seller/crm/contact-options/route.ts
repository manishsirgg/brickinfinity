import { NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

export async function GET() {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { data, error } = await ctx.supabase
      .from("seller_crm_contacts")
      .select("id,full_name,phone,whatsapp_number,email,contact_type,lifecycle_stage,lead_temperature")
      .eq("seller_id", ctx.sellerId)
      .eq("is_archived", false)
      .order("full_name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[seller-crm/contact-options]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
