import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getContactPropertyId } from "@/lib/seller-crm/property-link";

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
    console.log("[seller-crm-contact] requested contact id", id);
    const { data: foundAny } = await ctx.supabase.from("seller_crm_contacts").select("id,seller_id").eq("id", id).maybeSingle();
    console.log("[seller-crm-contact] contact exists any seller", { foundAny: Boolean(foundAny), ownerSellerId: foundAny?.seller_id ?? null });
    const { data, error } = await ctx.supabase.from("seller_crm_contacts").select("*").eq("id", id).eq("seller_id", ctx.sellerId).maybeSingle();
    console.log("[seller-crm-contact] seller scoped found", { found: Boolean(data) });
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "This CRM contact does not belong to your seller account." }, { status: 404 });
    const propertyId = getContactPropertyId(data);
    let propertySummary: any = null;
    if (propertyId) {
      const { data: property } = await ctx.supabase
        .from("properties")
        .select("id,slug,title,property_type,listing_type,city,locality,price,monthly_rent,rent,seller_id")
        .eq("id", propertyId)
        .eq("seller_id", ctx.sellerId)
        .maybeSingle();
      propertySummary = property ?? null;
    }
    return NextResponse.json({ ok: true, data: { ...data, property_summary: propertySummary } });
  } catch (e) {
    console.error("[seller-crm/contacts/:id]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    console.log("[seller-crm-contact] requested contact id", id);
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });

    const body = await req.json();
    const nextLifecycleStage = body?.lifecycle_stage ?? body?.stage;
    const nextLeadTemperature = body?.lead_temperature ?? body?.temperature;

    console.log("[seller-crm-contact] PATCH payload", {
      hasLifecycleStage: Object.prototype.hasOwnProperty.call(body ?? {}, "lifecycle_stage"),
      lifecycle_stage: body?.lifecycle_stage,
      hasLeadTemperature: Object.prototype.hasOwnProperty.call(body ?? {}, "lead_temperature"),
      lead_temperature: body?.lead_temperature,
    });

    const safeBody: any = Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => allow.includes(k)));
    if (nextLifecycleStage !== undefined) safeBody.lifecycle_stage = nextLifecycleStage;
    if (nextLeadTemperature !== undefined) safeBody.lead_temperature = nextLeadTemperature;

    if (safeBody.lifecycle_stage === undefined && safeBody.lead_temperature === undefined) {
      return NextResponse.json({ success: false, ok: false, error: "No valid contact update fields provided." }, { status: 400 });
    }

    if (safeBody.lifecycle_stage !== undefined && !stages.includes(safeBody.lifecycle_stage)) {
      return NextResponse.json({ success: false, ok: false, error: "Invalid lifecycle_stage" }, { status: 400 });
    }
    if (safeBody.lead_temperature !== undefined && !temperatures.includes(safeBody.lead_temperature)) {
      return NextResponse.json({ success: false, ok: false, error: "Invalid lead_temperature" }, { status: 400 });
    }

    if (safeBody.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(safeBody.email).trim())) {
      return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
    }
    if (safeBody.budget_min != null && safeBody.budget_max != null && Number(safeBody.budget_min) > Number(safeBody.budget_max)) {
      return NextResponse.json({ ok: false, error: "Minimum budget cannot be greater than maximum budget." }, { status: 400 });
    }
    if (safeBody.is_archived === true && !safeBody.archived_at) safeBody.archived_at = new Date().toISOString();
    if (safeBody.is_archived === false) safeBody.archived_at = null;

    const adminSupabase = createServiceClient();
    console.log("[seller-crm-contact] using verified admin update");
    const { data: contact, error: contactError } = await adminSupabase
      .from("seller_crm_contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return NextResponse.json({ success: false, ok: false, error: "CRM contact not found." }, { status: 404 });
    const ownerMatches = contact.seller_id === ctx.sellerId;
    console.log("[seller-crm-contact] verified owner check", {
      routeContactId: id,
      ctxSellerId: ctx.sellerId,
      contactSellerId: contact.seller_id ?? null,
      ownerMatches,
    });
    if (!ownerMatches) {
      return NextResponse.json({ success: false, ok: false, error: "This contact could not be updated because it does not belong to your seller account." }, { status: 404 });
    }

    const updatePayload: any = { ...safeBody, updated_by: ctx.sellerId };
    if (safeBody.lifecycle_stage === "archived") {
      updatePayload.is_archived = true;
      updatePayload.archived_at = new Date().toISOString();
    } else if (safeBody.lifecycle_stage && contact.is_archived) {
      updatePayload.is_archived = false;
      updatePayload.archived_at = null;
    }
    console.log("[seller-crm-contact] update payload", updatePayload);

    const { data: updatedContact, error: updateError } = await adminSupabase
      .from("seller_crm_contacts")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    console.log("[seller-crm-contact] update result", { success: !updateError, error: updateError });

    if (updateError) {
      const friendly = updateError.message.includes("duplicate") ? "This phone number or email already exists in your CRM." : updateError.message;
      return NextResponse.json({ ok: false, success: false, error: friendly }, { status: 400 });
    }
    if (!updatedContact) return NextResponse.json({ ok: false, success: false, error: "Not found" }, { status: 404 });
    console.log("[seller-crm-contact] update completed", { id: updatedContact.id });

    if (contact.lifecycle_stage !== updatedContact.lifecycle_stage) {
      const { error: stageLogError } = await adminSupabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "stage_change", channel: "system", title: "Stage changed", old_value: contact.lifecycle_stage, new_value: updatedContact.lifecycle_stage, metadata: { old_value: contact.lifecycle_stage, new_value: updatedContact.lifecycle_stage }, created_by: ctx.sellerId });
      if (stageLogError) console.error("[seller-crm-contact] activity log failed non-blocking", stageLogError);
      if (updatedContact.lifecycle_stage === "converted") {
        const { error: convertedLogError } = await adminSupabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "converted", channel: "system", title: "Contact converted", metadata: { old_value: contact.lifecycle_stage, new_value: updatedContact.lifecycle_stage }, created_by: ctx.sellerId });
        if (convertedLogError) console.error("[seller-crm-contact] activity log failed non-blocking", convertedLogError);
      }
      if (updatedContact.lifecycle_stage === "lost") {
        const { error: lostLogError } = await adminSupabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "lost", channel: "system", title: "Contact lost", metadata: { old_value: contact.lifecycle_stage, new_value: updatedContact.lifecycle_stage }, created_by: ctx.sellerId });
        if (lostLogError) console.error("[seller-crm-contact] activity log failed non-blocking", lostLogError);
      }
    }
    if (contact.lead_temperature !== updatedContact.lead_temperature) {
      const { error: temperatureLogError } = await adminSupabase.from("seller_crm_activities").insert({ seller_id: ctx.sellerId, contact_id: id, activity_type: "system", channel: "system", title: "Lead temperature changed", old_value: contact.lead_temperature, new_value: updatedContact.lead_temperature, metadata: { old_value: contact.lead_temperature, new_value: updatedContact.lead_temperature }, created_by: ctx.sellerId });
      if (temperatureLogError) console.error("[seller-crm-contact] activity log failed non-blocking", temperatureLogError);
    }

    return NextResponse.json({ success: true, ok: true, contact: updatedContact, data: updatedContact });
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
