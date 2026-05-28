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
    const summary = {
      totalContacts: total || 0,
      newContacts: newContacts || 0,
      hotLeads: hot || 0,
      followupsDueToday: dueToday || 0,
      overdueFollowups: overdue || 0,
      openDeals: openDeals || 0,
      convertedContacts: converted || 0,
      lostContacts: lost || 0,
      recentContacts: recentContacts || [],
      recentActivities: recentActivities || [],
    };
    return NextResponse.json({ok:true,data:{...summary,counts:{total_contacts:summary.totalContacts,new_contacts:summary.newContacts,hot_leads:summary.hotLeads,due_today_followups:summary.followupsDueToday,overdue_followups:summary.overdueFollowups,open_deals:summary.openDeals,converted_contacts:summary.convertedContacts,lost_contacts:summary.lostContacts},recent_contacts:summary.recentContacts,recent_activities:summary.recentActivities}});
  } catch (error) {
    console.error("[seller-crm/summary]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
