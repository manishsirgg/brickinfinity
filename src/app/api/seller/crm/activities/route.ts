import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";
import { buildPropertySummary, getContactPropertyId } from "@/lib/seller-crm/property-link";

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
    const activitiesBase = rows.map((r:any)=>({ ...r, contact_name: r.contact_id ? (map.get(r.contact_id) || null) : null }));
    const propertyIds = Array.from(new Set(activitiesBase.map((r:any)=>r.property_id || getContactPropertyId(r)).filter(Boolean)));
    const { data: properties } = propertyIds.length
      ? await c.supabase.from("properties").select("id,seller_id,title,slug,listing_type,property_type,price,hourly_rate,daily_rate,monthly_rate,status,verification_status,deleted_at").eq("seller_id", c.sellerId).in("id", propertyIds as string[]).is("deleted_at", null)
      : { data: [] as any[] };
    console.log("[seller-crm-property] linked ids", propertyIds);
const summaries = (properties ?? []).map((p:any)=>buildPropertySummary(p));
console.log("[seller-crm-property] fetched summaries count", summaries.length);
const propertyMap = new Map(summaries.map((p:any)=>[p.id,p]));
    const activities = activitiesBase.map((r:any) => {
      const propertySummary = propertyMap.get(r.property_id || getContactPropertyId(r)) ?? null;
      if (!propertySummary && (r.property_id || getContactPropertyId(r))) {
        console.log("[seller-crm-property] summary attached", { activityId: r.id, attached: false });
      }
      return {
        ...r,
        property_summary: propertySummary,
      };
    });
    return NextResponse.json({ ok: true, data: activities, activities });
  } catch (e) {
    console.error("[seller-crm/activities]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
