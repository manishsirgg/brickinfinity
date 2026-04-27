import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      property_id,
      seller_id,
      name,
      phone,
      email,
      message,
    } = body;

    /* ================= BASIC VALIDATION ================= */

    if (!property_id || !name || !phone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
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

    const { data: property } = await supabase
      .from("properties")
      .select("id, seller_id, status, deleted_at")
      .eq("id", property_id)
      .maybeSingle();

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

    if (seller_id && property.seller_id !== seller_id) {
      return NextResponse.json(
        { error: "Seller mismatch" },
        { status: 400 }
      );
    }

    /* ================= LEAD DEDUPLICATION ================= */

    const twelveHoursAgo =
      new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("property_id", property_id)
      .eq("buyer_phone", phone)
      .gte("created_at", twelveHoursAgo)
      .maybeSingle();

    if (existingLead) {
      return NextResponse.json({ success: true });
    }

    /* ================= INSERT LEAD ================= */

    const { error } = await supabase
      .from("leads")
      .insert({
        property_id,
        seller_id: property.seller_id,
        buyer_name: name,
        buyer_phone: phone,
        buyer_email: email,
        message,
        status: "new",
      });

    if (error) {
      console.error("Lead insert error:", error);
      return NextResponse.json(
        { error: "Failed to create lead" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Lead API error:", err);

    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
