import { NextRequest, NextResponse } from "next/server";
import { resolveSellerCrmContext } from "@/lib/seller-crm/auth";
import { isSellerCrmDealStage } from "@/lib/seller-crm/deal-stages";

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildDefaultDealTitle(contact: any, propertySummary: any): string {
  const contactName = typeof contact?.full_name === "string" && contact.full_name.trim() ? contact.full_name.trim() : "";
  const propertyTitle = typeof propertySummary?.title === "string" && propertySummary.title.trim() ? propertySummary.title.trim() : "";
  if (contactName && propertyTitle) return `${contactName} — ${propertyTitle}`;

  const propertyType = typeof propertySummary?.property_type === "string" ? propertySummary.property_type.trim() : "";
  const listingType = typeof propertySummary?.listing_type === "string" ? propertySummary.listing_type.trim() : "";
  if (contactName && (propertyType || listingType)) return `${contactName} — ${[propertyType, listingType].filter(Boolean).join(" ")} Deal`;
  if (contactName) return `${contactName} — Property Deal`;
  return "New Property Deal";
}

export async function GET() {
  try {
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });
    const { data, error } = await c.supabase.from("seller_crm_deals").select("*").eq("seller_id", c.sellerId).order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e) {
    console.error("[seller-crm/deal]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await resolveSellerCrmContext();
    if (!c.ok) return NextResponse.json({ ok: false, error: c.error, details: c.details }, { status: c.status });

    const b = await req.json();
    const { seller_id, created_by, updated_by, ...payload } = b ?? {};

    if (!payload.contact_id) return NextResponse.json({ ok: false, error: "contact_id is required" }, { status: 400 });

    const { data: contact } = await c.supabase
      .from("seller_crm_contacts")
      .select("id,full_name,metadata,property_summary")
      .eq("id", payload.contact_id)
      .eq("seller_id", c.sellerId)
      .maybeSingle();
    if (!contact) return NextResponse.json({ ok: false, error: "This contact does not belong to your seller account." }, { status: 400 });

    const propertySummary = (contact as any)?.property_summary && typeof (contact as any).property_summary === "object" ? (contact as any).property_summary : null;
    const metadata = (contact as any)?.metadata && typeof (contact as any).metadata === "object" ? (contact as any).metadata : null;

    const resolvedPropertyId = payload.property_id ?? metadata?.last_property_id ?? propertySummary?.id ?? null;

    if (resolvedPropertyId) {
      const { data: p } = await c.supabase.from("properties").select("id").eq("id", resolvedPropertyId).eq("seller_id", c.sellerId).maybeSingle();
      if (!p) return NextResponse.json({ ok: false, error: "This property does not belong to your seller account." }, { status: 400 });
    }

    const dealStage = payload.deal_stage ?? "new_deal";
    if (!isSellerCrmDealStage(dealStage)) {
      return NextResponse.json({ ok: false, error: "Invalid deal_stage value" }, { status: 400 });
    }

    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : buildDefaultDealTitle(contact, propertySummary);

    const expectedValue = payload.expected_value ?? asNumber(propertySummary?.monthly_rate) ?? asNumber(propertySummary?.price);

    const insertPayload = {
      ...payload,
      title,
      deal_stage: dealStage,
      property_id: resolvedPropertyId,
      expected_value: asNumber(expectedValue),
      seller_id: c.sellerId,
      created_by: c.sellerId,
      updated_by: c.sellerId,
    };

    const { data, error } = await c.supabase.from("seller_crm_deals").insert(insertPayload).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    await c.supabase.from("seller_crm_activities").insert({
      seller_id: c.sellerId,
      contact_id: data.contact_id,
      deal_id: data.id,
      property_id: data.property_id,
      activity_type: "deal_created",
      channel: "system",
      title: "Deal created",
      body: data.title,
      created_by: c.sellerId,
    });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("[seller-crm/deal]", e);
    return NextResponse.json({ ok: false, error: "Unexpected error" }, { status: 500 });
  }
}
