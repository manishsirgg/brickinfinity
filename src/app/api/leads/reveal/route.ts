import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to reveal seller contact details and track your enquiry." }, { status: 401 });
    const body = await req.json();
    const {
      property_id,
      buyer_phone,
      buyer_name,
      buyer_email,
      message,
    } = body ?? {};

    const digits = String(buyer_phone || "").replace(/\D/g, "");
    const normalizedPhone = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;

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
      .select("seller_id, status, availability_status, deleted_at")
      .eq("id", property_id)
      .maybeSingle();

    if (!property || property.status !== "active" || property.deleted_at || ["rented", "sold", "unavailable"].includes(property.availability_status)) {
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


    // Use the same checked submission, delivery and CRM flow as the enquiry form.
    const { POST: submitLead } = await import("@/app/api/leads/route");
    const delivered = await submitLead(new Request(req.url, {
      method: "POST", headers: req.headers,
      body: JSON.stringify({ property_id, name: buyer_name, phone: buyer_phone,
        email: buyer_email, message, request_key: body.request_key }),
    }));
    if (!delivered.ok) return delivered;

    const phone = String(
      sellerProfile?.phone || sellerProfile?.whatsapp_number || ""
    ).replace(/\D/g, "");

    if (!phone) {
      return NextResponse.json(
        { error: "Your enquiry was delivered, but the seller phone is unavailable. Track the enquiry in My enquiries & visits." },
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
