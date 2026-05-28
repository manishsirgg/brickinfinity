import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits || null;
}

function normalizeIndianWhatsApp(raw?: string | null) {
  const phone = normalizePhone(raw);
  if (!phone) return null;
  return `91${phone}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { property_id, name, phone, email, message } = body;

    /* ================= BASIC VALIDATION ================= */

    if (!property_id || !name || (!phone && !email)) {
      return NextResponse.json(
        { error: "property_id, buyer_name and phone/email are required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    if (phone && (!normalizedPhone || !/^[6-9]\d{9}$/.test(normalizedPhone))) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    /* ================= SERVER SUPABASE CLIENT ================= */

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    /* ================= VERIFY PROPERTY ================= */

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, seller_id, title, status, deleted_at")
      .eq("id", property_id)
      .maybeSingle();

    if (propertyError) {
      console.error("[property-lead] property lookup failed", propertyError);
      return NextResponse.json({ error: "Unable to process enquiry" }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json(
        { error: "Property not found" },
        { status: 404 }
      );
    }

    if (property.status !== "active" || property.deleted_at) {
      return NextResponse.json(
        { error: "Property not active" },
        { status: 400 }
      );
    }

    if (!property.seller_id) {
      return NextResponse.json(
        { error: "Property owner unavailable" },
        { status: 400 }
      );
    }

    const { data: sellerProfile } = await supabase
      .from("users")
      .select("id")
      .or(`id.eq.${property.seller_id},user_id.eq.${property.seller_id}`)
      .maybeSingle();

    const resolvedSellerId = sellerProfile?.id || property.seller_id;

    /* ================= LEAD DEDUPLICATION ================= */

    const twelveHoursAgo =
      new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("property_id", property_id)
      .eq("buyer_phone", normalizedPhone)
      .gte("created_at", twelveHoursAgo)
      .maybeSingle();

    if (existingLead) {
      return NextResponse.json({ success: true });
    }

    /* ================= INSERT LEAD ================= */

    const { data: insertedLead, error } = await supabase
      .from("leads")
      .insert({
        property_id,
        seller_id: resolvedSellerId,
        buyer_name: name,
        buyer_phone: normalizedPhone,
        buyer_email: email,
        message,
        status: "new",
        contacted: false,
      });

    if (error) {
      console.error("[property-lead] Lead insert error:", error);
      return NextResponse.json(
        { error: "Failed to create lead" },
        { status: 500 }
      );
    }

    const { data: leadRow } = await supabase
      .from("leads")
      .select("id")
      .eq("property_id", property_id)
      .eq("seller_id", resolvedSellerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    try {
      const contactQuery = supabase
        .from("seller_crm_contacts")
        .select("id, lifecycle_stage, metadata")
        .eq("seller_id", resolvedSellerId)
        .eq("is_archived", false)
        .limit(1);
      const { data: existingContact } = normalizedPhone
        ? await contactQuery.eq("phone", normalizedPhone).maybeSingle()
        : await contactQuery.eq("email", String(email || "").trim()).maybeSingle();

      const metadata = {
        ...(existingContact?.metadata || {}),
        last_property_id: property_id,
        last_lead_id: leadRow?.id || null,
        last_message: message || "",
        source: "property_detail_form",
      };

      let contactId = existingContact?.id;
      if (existingContact) {
        const shouldKeepStage = ["converted", "lost", "qualified", "negotiation", "site_visit"].includes(existingContact.lifecycle_stage);
        const { data: updatedContact } = await supabase
          .from("seller_crm_contacts")
          .update({
            full_name: name,
            phone: normalizedPhone || undefined,
            whatsapp_number: normalizeIndianWhatsApp(normalizedPhone),
            email: email || undefined,
            source: "property_enquiry",
            source_details: property.title || "Property enquiry",
            notes: message || "Enquiry received from property detail form",
            lifecycle_stage: shouldKeepStage ? undefined : "new",
            lead_temperature: "hot",
            metadata,
            updated_by: resolvedSellerId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingContact.id)
          .eq("seller_id", resolvedSellerId)
          .select("id")
          .maybeSingle();
        contactId = updatedContact?.id || contactId;
      } else {
        const { data: insertedContact } = await supabase
          .from("seller_crm_contacts")
          .insert({
            seller_id: resolvedSellerId,
            full_name: name,
            phone: normalizedPhone,
            whatsapp_number: normalizeIndianWhatsApp(normalizedPhone),
            email: email || null,
            contact_type: "buyer",
            lifecycle_stage: "new",
            lead_temperature: "hot",
            source: "property_enquiry",
            source_details: property.title || "Property enquiry",
            notes: message || "Enquiry received from property detail form",
            metadata,
            created_by: resolvedSellerId,
            updated_by: resolvedSellerId,
          })
          .select("id")
          .single();
        contactId = insertedContact?.id;
      }

      if (contactId) {
        const activityBody = message || "New enquiry submitted from property detail form.";
        await supabase.from("seller_crm_activities").insert({
          seller_id: resolvedSellerId,
          contact_id: contactId,
          property_id,
          activity_type: "lead_created",
          channel: "system",
          title: "New property enquiry",
          body: activityBody,
          metadata: { lead_id: leadRow?.id || null, property_id, buyer_name: name, buyer_phone: normalizedPhone, buyer_email: email || null, source: "property_detail_form" },
          created_by: resolvedSellerId,
        });
        await supabase.from("seller_crm_notes").insert({
          seller_id: resolvedSellerId,
          contact_id: contactId,
          property_id,
          title: "Property enquiry",
          body: activityBody,
          metadata: { lead_id: leadRow?.id || null, source: "property_detail_form" },
          created_by: resolvedSellerId,
        });
      }
    } catch (crmError) {
      console.error("[crm-auto-sync] failed to sync lead to CRM", crmError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[property-lead] Lead API error:", err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
