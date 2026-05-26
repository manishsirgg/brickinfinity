import { NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

export async function GET() {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { data, error } = await ctx.supabase
      .from("properties")
      .select("id,title,listing_type,property_type,price,status,verification_status")
      .eq("seller_id", ctx.sellerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    console.error("[seller-crm/property-options]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
