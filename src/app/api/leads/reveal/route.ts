import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { property_id, buyer_phone } = body ?? {};

    if (!property_id || !buyer_phone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!/^[6-9]\d{9}$/.test(buyer_phone)) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: property } = await supabase
      .from("properties")
      .select("seller_id, status, deleted_at")
      .eq("id", property_id)
      .maybeSingle();

    if (!property || property.status !== "active" || property.deleted_at) {
      return NextResponse.json(
        { error: "Property not available" },
        { status: 400 }
      );
    }

    if (!property.seller_id) {
      return NextResponse.json(
        { error: "Seller unavailable" },
        { status: 400 }
      );
    }

    const { data: recentLead } = await supabase
      .from("leads")
      .select("id")
      .eq("property_id", property_id)
      .eq("buyer_phone", buyer_phone)
      .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!recentLead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 403 }
      );
    }

    const { data: seller } = await supabase
      .from("users")
      .select("phone")
      .eq("id", property.seller_id)
      .maybeSingle();

    const phone = String(seller?.phone || "").replace(/\D/g, "");

    if (!phone) {
      return NextResponse.json(
        { error: "Seller phone unavailable" },
        { status: 404 }
      );
    }

    return NextResponse.json({ phone });
  } catch (error) {
    console.error("Reveal seller phone API error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
