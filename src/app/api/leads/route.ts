import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
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
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const body = await req.json();
    const { property_id, name, phone, email, message, request_key, visit_at } = body;
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to send and track an enquiry." }, { status: 401 });
    if (typeof name !== "string" || typeof phone !== "string" || (email != null && typeof email !== "string") || (message != null && typeof message !== "string")) {
      return NextResponse.json({ error: "Enter valid contact details." }, { status: 400 });
    }
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = email?.trim().toLowerCase() || null;
    const normalizedWhatsAppNumber = normalizePhoneForWhatsApp(phone);
    const safeMessage = message?.trim() || "";
    const { data: submitted, error: submissionError } = await client.rpc("submit_property_enquiry", {
      p_property_id: property_id, p_request_key: request_key,
      p_name: name, p_phone: normalizedPhone, p_email: normalizedEmail,
      p_message: safeMessage, p_visit_at: visit_at || null,
    });
    if (submissionError) return NextResponse.json({ error: submissionError.code === "P0001" ? submissionError.message : "Unable to submit this enquiry. Please try again." }, { status: 400 });
    if (submitted.duplicate) return NextResponse.json({ success: true, enquiry_id: submitted.id, delivery: "inbox", duplicate: true });
    const resolvedSellerId = submitted.seller_id;
    const leadRow = { id: submitted.lead_id };
    const property = { id: property_id, title: submitted.property_title };

    let crmSync: "completed" | "failed" = "completed";
    let contactId: string | undefined;
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

      contactId = existingContact?.id;
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

    try {
      await createServiceClient().from("property_enquiries").update({ crm_sync: crmSync }).eq("id", submitted.id);
    } catch { /* Inbox delivery already committed; CRM failure must not report a lost enquiry. */ }
    return NextResponse.json({ success: true, enquiry_id: submitted.id, delivery: "inbox", crmSync });
  } catch (err) {
    console.error("[property-lead] Lead API error:", err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
