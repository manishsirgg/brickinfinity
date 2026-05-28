import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const actionMap = {
  call: { activity_type: "call", channel: "call", title: "Call action used" },
  whatsapp: { activity_type: "whatsapp", channel: "whatsapp", title: "WhatsApp action used" },
  email: { activity_type: "email", channel: "email", title: "Email action used" },
} as const;

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveSellerCrmContext();
    if (!ctx.ok) return NextResponse.json({ ok: false, error: ctx.error, details: ctx.details }, { status: ctx.status });
    const body = await req.json();
    const contactId = String(body?.contact_id ?? "").trim();
    const propertyId = body?.property_id ? String(body.property_id).trim() : null;
    const action = body?.action as keyof typeof actionMap;
    if (!contactId || !isUuid(contactId)) return NextResponse.json({ ok: false, error: "Invalid contact_id" }, { status: 400 });
    if (!action || !actionMap[action]) return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    if (propertyId && !isUuid(propertyId)) return NextResponse.json({ ok: false, error: "Invalid property_id" }, { status: 400 });

    const { data: contact } = await ctx.supabase.from("seller_crm_contacts").select("id").eq("id", contactId).eq("seller_id", ctx.sellerId).maybeSingle();
    if (!contact) return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    if (propertyId) {
      const { data: property } = await ctx.supabase.from("properties").select("id").eq("id", propertyId).eq("seller_id", ctx.sellerId).maybeSingle();
      if (!property) return NextResponse.json({ ok: false, error: "Property not found" }, { status: 404 });
    }

    const mapped = actionMap[action];
    const { error } = await ctx.supabase.from("seller_crm_activities").insert({
      seller_id: ctx.sellerId,
      contact_id: contactId,
      property_id: propertyId,
      activity_type: mapped.activity_type,
      channel: mapped.channel,
      title: mapped.title,
      created_by: ctx.sellerId,
    });
    if (error) return NextResponse.json({ ok: false, error: "Unable to log action" }, { status: 400 });
    return NextResponse.json({ ok: true, data: true });
  } catch (error) {
    console.error("[seller-crm-activity]", error);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
