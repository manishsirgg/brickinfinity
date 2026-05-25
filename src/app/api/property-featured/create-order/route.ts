import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRazorpayClient } from "@/lib/razorpay";

type CreateOrderBody = {
  propertyId?: string;
  planKey?: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Please login to promote your property." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as CreateOrderBody;

    if (!body.propertyId) {
      return NextResponse.json(
        { ok: false, error: "Property ID is required." },
        { status: 400 }
      );
    }

    if (!body.planKey) {
      return NextResponse.json(
        { ok: false, error: "Featured plan is required." },
        { status: 400 }
      );
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (appUserError || !appUser) {
      return NextResponse.json(
        { ok: false, error: "User profile not found." },
        { status: 404 }
      );
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, seller_id, status, deleted_at")
      .eq("id", body.propertyId)
      .maybeSingle();

    if (propertyError || !property) {
      return NextResponse.json(
        { ok: false, error: "Property not found." },
        { status: 404 }
      );
    }

    if (property.seller_id !== appUser.id) {
      return NextResponse.json(
        { ok: false, error: "You can promote only your own property." },
        { status: 403 }
      );
    }

    if (property.status !== "approved") {
      return NextResponse.json(
        { ok: false, error: "Only approved properties can be promoted as Featured." },
        { status: 400 }
      );
    }

    if (property.deleted_at !== null) {
      return NextResponse.json(
        { ok: false, error: "Deleted properties cannot be promoted." },
        { status: 400 }
      );
    }

    const { data: plan, error: planError } = await supabase
      .from("property_featured_plans")
      .select("id, plan_key, name, duration_days, amount_paise, compare_at_amount_paise, currency, badge, is_active")
      .eq("plan_key", body.planKey)
      .maybeSingle();

    if (planError || !plan || !plan.is_active) {
      return NextResponse.json(
        { ok: false, error: "Featured plan not found or inactive." },
        { status: 404 }
      );
    }

    const razorpayOrder = await getRazorpayClient().orders.create({
      amount: plan.amount_paise,
      currency: "INR",
      receipt: `featured_${property.id}_${Date.now()}`,
      notes: {
        purpose: "property_featured_listing",
        property_id: property.id,
        owner_id: appUser.id,
        plan_key: plan.plan_key,
      },
    });

    const { data: insertedOrder, error: orderInsertError } = await supabase
      .from("property_featured_orders")
      .insert({
        property_id: property.id,
        owner_id: appUser.id,
        plan_id: plan.id,
        plan_key: plan.plan_key,
        plan_name: plan.name,
        duration_days: plan.duration_days,
        amount_paise: plan.amount_paise,
        compare_at_amount_paise: plan.compare_at_amount_paise,
        currency: plan.currency || "INR",
        payment_status: "created",
        activation_status: "pending",
        razorpay_order_id: razorpayOrder.id,
        metadata: {
          razorpay_order: razorpayOrder,
          created_from: "seller_dashboard",
        },
      })
      .select("id")
      .single();

    if (orderInsertError || !insertedOrder) {
      throw orderInsertError ?? new Error("Unable to create featured listing order row");
    }

    return NextResponse.json(
      {
        ok: true,
        featuredOrderId: insertedOrder.id,
        razorpayOrderId: razorpayOrder.id,
        amount: plan.amount_paise,
        currency: "INR",
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        plan: {
          name: plan.name,
          durationDays: plan.duration_days,
          badge: plan.badge,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[property-featured/create-order]", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create featured listing order." },
      { status: 500 }
    );
  }
}
