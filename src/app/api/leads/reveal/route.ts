import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      property_id,
      buyer_phone,
      buyer_name,
      buyer_email,
      message,
    } = body ?? {};

    const normalizedPhone = String(buyer_phone || "").replace(/\D/g, "");

    if (!property_id || !buyer_name || !normalizedPhone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
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

    const { data: sellerProfile } = await supabase
      .from("users")
      .select("id, full_name, phone, whatsapp_number")
      .or(`id.eq.${property.seller_id},user_id.eq.${property.seller_id}`)
      .maybeSingle();

    const resolvedSellerId = sellerProfile?.id || property.seller_id;

    const { data: recentLead } = await supabase
      .from("leads")
      .select("id")
      .eq("property_id", property_id)
      .eq("buyer_phone", normalizedPhone)
      .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
      .maybeSingle();

    if (!recentLead) {
      const { error: insertLeadError } = await supabase
        .from("leads")
        .insert({
          property_id,
          seller_id: resolvedSellerId,
          buyer_name,
          buyer_phone: normalizedPhone,
          buyer_email,
          message,
          status: "new",
        });

      if (insertLeadError) {
        console.error("Reveal lead insert error:", insertLeadError);
        return NextResponse.json(
          { error: "Failed to create lead" },
          { status: 500 }
        );
      }
    }

    const phone = String(
      sellerProfile?.phone || sellerProfile?.whatsapp_number || ""
    ).replace(/\D/g, "");

    if (!phone) {
      return NextResponse.json(
        { error: "Seller phone unavailable" },
        { status: 404 }
      );
    }

    const { error: revealLogError } = await supabase
      .from("phone_reveal_logs")
      .insert({
        property_id,
        buyer_phone: normalizedPhone,
      });

    if (revealLogError) {
      console.error("Phone reveal log insert error:", revealLogError);
    }

    return NextResponse.json({
      phone,
      seller_name: sellerProfile?.full_name || null,
    });
  } catch (error) {
    console.error("Reveal seller phone API error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
