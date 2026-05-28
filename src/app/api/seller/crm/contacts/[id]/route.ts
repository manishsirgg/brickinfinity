import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const allow = ["full_name", "phone", "whatsapp_number", "email", "contact_type", "lifecycle_stage", "lead_temperature", "source", "source_details", "city", "locality", "state", "country", "preferred_purpose", "preferred_property_type", "preferred_bedrooms", "budget_min", "budget_max", "preferred_location", "notes", "last_contacted_at", "next_followup_at", "is_archived", "archived_at", "metadata"];
const stages = ["new", "contacted", "qualified", "site_visit", "negotiation", "converted", "lost", "archived"];
const temperatures = ["cold", "warm", "hot"];

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { data, error } = await ctx.supabase.from("seller_crm_contacts").select("*").eq("id", id).eq("seller_id", ctx.sellerId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[seller-crm/contacts/:id]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.info("[seller-crm-contact] PATCH reached", { id });
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    console.info("[seller-crm-contact] seller resolved");
    const body = await req.json();
    const safeBody: any = Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => allow.includes(k)));
    if (safeBody.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(safeBody.email).trim())) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
    }
    if (safeBody.budget_min != null && safeBody.budget_max != null && Number(safeBody.budget_min) > Number(safeBody.budget_max)) {
      return NextResponse.json({ ok: false, error: "Minimum budget cannot be greater than maximum budget." }, { status: 400 });
    }
    if (safeBody.is_archived === true && !safeBody.archived_at) safeBody.archived_at = new Date().toISOString();
    if (safeBody.is_archived === false) safeBody.archived_at = null;

    const { data: current } = await ctx.supabase.from("seller_crm_contacts").select("lifecycle_stage,lead_temperature,contact_id,id").eq("id", id).eq("seller_id", ctx.sellerId).maybeSingle();
    console.info("[seller-crm-contact] contact lookup result", { found: Boolean(current) });
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (safeBody.lifecycle_stage && !stages.includes(safeBody.lifecycle_stage)) return NextResponse.json({ ok: false, error: "Invalid lifecycle_stage" }, { status: 400 });
    if (safeBody.lead_temperature && !temperatures.includes(safeBody.lead_temperature)) return NextResponse.json({ ok: false, error: "Invalid lead_temperature" }, { status: 400 });
    const { data, error } = await ctx.supabase
      .from("seller_crm_contacts")
      .update({ ...safeBody, updated_by: ctx.sellerId })
      .eq("id", id)
      .eq("seller_id", ctx.sellerId)
      .select("*")
      .maybeSingle();

    if (error) {
      const friendly = error.message.includes("duplicate") ? "This phone number or email already exists in your CRM." : error.message;
      return NextResponse.json({ ok: false, error: friendly }, { status: 400 });
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (current.lifecycle_stage !== data.lifecycle_stage) {
      await ctx.supabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "stage_change", channel: "system", title: "Stage changed", old_value: current.lifecycle_stage, new_value: data.lifecycle_stage, created_by: ctx.sellerId });
      if (data.lifecycle_stage === "converted") await ctx.supabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "converted", channel: "system", title: "Contact converted", created_by: ctx.sellerId });
      if (data.lifecycle_stage === "lost") await ctx.supabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "lost", channel: "system", title: "Contact lost", created_by: ctx.sellerId });
    }
    if (current.lead_temperature !== data.lead_temperature) {
      await ctx.supabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "system", channel: "system", title: "Lead temperature changed", old_value: current.lead_temperature, new_value: data.lead_temperature, created_by: ctx.sellerId });
    }
    console.info("[seller-crm-contact] updated", { id: data.id });
    return NextResponse.json({ ok: true, success: true, contact: data, data });
  } catch (e) {
    console.error("[seller-crm/contacts/:id]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const { error } = await ctx.supabase
      .from("seller_crm_contacts")
      .update({ is_archived: true, archived_at: new Date().toISOString(), updated_by: ctx.sellerId })
      .eq("id", id)
      .eq("seller_id", ctx.sellerId);
    if (error) throw error;
    return NextResponse.json({ ok: true, data: true });
  } catch (e) {
    console.error("[seller-crm/contacts/:id]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
