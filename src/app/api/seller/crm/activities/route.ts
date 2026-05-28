import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

export async function GET(req: NextRequest) {
  try {
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });
    const sp = req.nextUrl.searchParams;
    let q = c.supabase.from("seller_crm_activities").select("*").eq("seller_id", c.sellerId);
    for (const k of ["activity_type", "channel", "contact_id", "deal_id", "property_id"]) {
      const v = sp.get(k);
      if (v) q = q.eq(k, v);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    const rows = data ?? [];
    const contactIds = Array.from(new Set(rows.map((r:any)=>r.contact_id).filter(Boolean)));
    const { data: contacts } = contactIds.length ? await c.supabase.from("seller_crm_contacts").select("id,full_name").eq("seller_id",c.sellerId).in("id", contactIds) : {data:[] as any[]};
    const map = new Map((contacts||[]).map((x:any)=>[x.id,x.full_name]));
    const activities = rows.map((r:any)=>({ ...r, contact_name: r.contact_id ? (map.get(r.contact_id) || null) : null }));
    return NextResponse.json({ ok: true, data: activities, activities });
  } catch (e) {
    console.error("[seller-crm/activities]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
