import { NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

export async function GET() {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { supabase, sellerId } = ctx;
    const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0);
    const tomorrow = new Date(todayStart); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    const [{count:total},{count:newContacts},{count:hot},{count:converted},{count:lost},{count:openDeals},{count:dueToday},{count:overdue},{data:recentContacts},{data:recentActivities}] = await Promise.all([
      supabase.from("seller_crm_contacts").select("id",{count:"exact",head:true}).eq("seller_id",sellerId),
      supabase.from("seller_crm_contacts").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("lifecycle_stage","new"),
      supabase.from("seller_crm_contacts").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("lead_temperature","hot"),
      supabase.from("seller_crm_contacts").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("lifecycle_stage","converted"),
      supabase.from("seller_crm_contacts").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("lifecycle_stage","lost"),
      supabase.from("seller_crm_deals").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).not("deal_stage","in","(closed_won,closed_lost)"),
      supabase.from("seller_crm_followups").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("status","scheduled").gte("due_at",todayStart.toISOString()).lt("due_at",tomorrow.toISOString()),
      supabase.from("seller_crm_followups").select("id",{count:"exact",head:true}).eq("seller_id",sellerId).eq("status","scheduled").lt("due_at",todayStart.toISOString()),
      supabase.from("seller_crm_contacts").select("id,full_name,created_at,lifecycle_stage,lead_temperature").eq("seller_id",sellerId).order("created_at",{ascending:false}).limit(10),
      supabase.from("seller_crm_activities").select("id,title,activity_type,channel,created_at").eq("seller_id",sellerId).order("created_at",{ascending:false}).limit(10),
    ]);
    return NextResponse.json({ok:true,data:{counts:{total_contacts:total||0,new_contacts:newContacts||0,hot_leads:hot||0,due_today_followups:dueToday||0,overdue_followups:overdue||0,open_deals:openDeals||0,converted_contacts:converted||0,lost_contacts:lost||0},recent_contacts:recentContacts||[],recent_activities:recentActivities||[]}});
  } catch (error) {
    console.error("[seller-crm/summary]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
