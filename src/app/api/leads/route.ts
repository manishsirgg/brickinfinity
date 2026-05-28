import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/service";

type SupabaseErrorShape = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function normalizePhone(raw?: string | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits || null;
}

function normalizePhoneForWhatsApp(phone?: string | null) {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d]/g, "");
  if (!cleaned) return null;
  if (cleaned.length === 10) return `91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return cleaned;
  return cleaned.length >= 10 ? cleaned : null;
}

function toSupabaseErrorShape(error: unknown): SupabaseErrorShape {
  if (!error || typeof error !== "object") return {};
  const maybe = error as SupabaseErrorShape;
  return {
    code: maybe.code,
    message: maybe.message,
    details: maybe.details,
    hint: maybe.hint,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.info("[property-lead] received payload", {
      property_id: body?.property_id,
      has_name: Boolean(body?.name),
      has_phone: Boolean(body?.phone),
      has_email: Boolean(body?.email),
    });

    const { property_id, name, phone, email, message } = body;

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

    const normalizedWhatsAppNumber = normalizePhoneForWhatsApp(phone);
    const normalizedEmail = typeof email === "string" ? email.trim() : null;
    const safeMessage = (typeof message === "string" && message.trim())
      ? message.trim()
      : "Enquiry received from property detail form";

    const supabase = createServiceClient();

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, seller_id, title, status, deleted_at")
      .eq("id", property_id)
      .maybeSingle();

    if (propertyError) {
      console.error("[property-lead] property lookup failed", toSupabaseErrorShape(propertyError));
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
    console.info("[property-lead] property seller resolved", { property_id, seller_id: resolvedSellerId });

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
      return NextResponse.json({ success: true, crmSync: "skipped" });
    }

    const { error } = await supabase
      .from("leads")
      .insert({
        property_id,
        seller_id: resolvedSellerId,
        buyer_name: name,
        buyer_phone: normalizedPhone,
        buyer_email: normalizedEmail,
        message,
        status: "new",
        contacted: false,
      });

    if (error) {
      console.error("[property-lead] Lead insert error", toSupabaseErrorShape(error));
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

    console.info("[property-lead] lead created", { lead_id: leadRow?.id || null, property_id, seller_id: resolvedSellerId });

    let crmSync: "completed" | "failed" = "completed";
    try {
      console.info("[crm-auto-sync] starting", { lead_id: leadRow?.id || null, property_id, seller_id: resolvedSellerId });
      const supabaseAdmin = createServiceClient();
      console.info("[crm-auto-sync] using admin client");

      let existingContact: { id: string; lifecycle_stage: string | null; metadata: Record<string, unknown> | null } | null = null;

      if (normalizedPhone) {
        const { data: phoneContact, error: phoneLookupError } = await supabaseAdmin
          .from("seller_crm_contacts")
          .select("id, lifecycle_stage, metadata")
          .eq("seller_id", resolvedSellerId)
          .eq("is_archived", false)
          .eq("phone", normalizedPhone)
          .limit(1)
          .maybeSingle();
        if (phoneLookupError) throw phoneLookupError;
        existingContact = phoneContact;
      }

      if (!existingContact && normalizedEmail) {
        const { data: emailContact, error: emailLookupError } = await supabaseAdmin
          .from("seller_crm_contacts")
          .select("id, lifecycle_stage, metadata")
          .eq("seller_id", resolvedSellerId)
          .eq("is_archived", false)
          .eq("email", normalizedEmail)
          .limit(1)
          .maybeSingle();
        if (emailLookupError) throw emailLookupError;
        existingContact = emailContact;
      }

      console.info("[crm-auto-sync] existing contact lookup result", {
        seller_id: resolvedSellerId,
        found: Boolean(existingContact),
        contact_id: existingContact?.id || null,
      });

      const metadata = {
        ...((existingContact?.metadata as Record<string, unknown> | null) || {}),
        source: "property_detail_form",
        last_lead_id: leadRow?.id || null,
        last_property_id: property.id,
        last_message: safeMessage,
        last_buyer_name: name,
        last_buyer_phone: normalizedPhone,
        last_buyer_email: normalizedEmail,
        last_enquiry_at: new Date().toISOString(),
      };

      let contactId = existingContact?.id;
      if (existingContact) {
        const shouldKeepStage = ["qualified", "site_visit", "negotiation", "converted", "lost", "archived"].includes(existingContact.lifecycle_stage || "");
        const { data: updatedContact, error: updateError } = await supabaseAdmin
          .from("seller_crm_contacts")
          .update({
            full_name: name || undefined,
            phone: normalizedPhone || undefined,
            whatsapp_number: normalizedWhatsAppNumber,
            email: normalizedEmail || undefined,
            lead_temperature: "hot",
            source: "property_enquiry",
            source_details: property.title || "Property enquiry",
            notes: safeMessage,
            lifecycle_stage: shouldKeepStage ? undefined : "new",
            metadata,
            updated_by: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingContact.id)
          .eq("seller_id", resolvedSellerId)
          .select("id")
          .single();
        if (updateError) throw updateError;
        contactId = updatedContact.id;
        console.info("[crm-auto-sync] contact updated", { contact_id: contactId });
      } else {
        const { data: insertedContact, error: insertContactError } = await supabaseAdmin
          .from("seller_crm_contacts")
          .insert({
            seller_id: resolvedSellerId,
            full_name: name,
            phone: normalizedPhone,
            whatsapp_number: normalizedWhatsAppNumber,
            email: normalizedEmail,
            contact_type: "buyer",
            lifecycle_stage: "new",
            lead_temperature: "hot",
            source: "property_enquiry",
            source_details: property.title || "Property enquiry",
            notes: safeMessage,
            metadata,
            created_by: null,
            updated_by: null,
          })
          .select("id")
          .single();
        if (insertContactError) throw insertContactError;
        contactId = insertedContact.id;
        console.info("[crm-auto-sync] contact inserted", { contact_id: contactId });
      }

      if (contactId) {
        const activityMetadata = {
          source: "property_detail_form",
          lead_id: leadRow?.id || null,
          property_id: property.id,
          buyer_name: name,
          buyer_phone: normalizedPhone,
          buyer_email: normalizedEmail,
        };

        const { error: activityError } = await supabaseAdmin.from("seller_crm_activities").insert({
          seller_id: resolvedSellerId,
          contact_id: contactId,
          property_id,
          activity_type: "lead_created",
          channel: "system",
          title: "New property enquiry",
          body: safeMessage,
          metadata: activityMetadata,
          created_by: null,
        });
        if (activityError) throw activityError;
        console.info("[crm-auto-sync] activity inserted", { contact_id: contactId });

        const { error: noteError } = await supabaseAdmin.from("seller_crm_notes").insert({
          seller_id: resolvedSellerId,
          contact_id: contactId,
          property_id,
          title: "Property enquiry",
          body: safeMessage,
          metadata: activityMetadata,
          created_by: null,
        });
        if (noteError) throw noteError;
        console.info("[crm-auto-sync] note inserted", { contact_id: contactId });
      }
    } catch (crmError) {
      crmSync = "failed";
      console.error("[crm-auto-sync] failed", toSupabaseErrorShape(crmError));
    }

    return NextResponse.json({ success: true, crmSync });
  } catch (err) {
    console.error("[property-lead] Lead API error:", err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
