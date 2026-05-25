import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyFeaturedPaymentEvent } from "@/lib/property-featured/communications";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as { featuredOrderId?: string; razorpay_order_id?: string; razorpay_payment_id?: string; reason?: string };
    if (!body.featuredOrderId) return NextResponse.json({ ok: false, error: "Missing featuredOrderId" }, { status: 400 });

    const { data: appUser } = await supabase.from("users").select("id, full_name, email, phone, whatsapp_number").eq("user_id", user.id).maybeSingle();
    if (!appUser) return NextResponse.json({ ok: false, error: "User profile not found" }, { status: 404 });

    const { data: order } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, owner_id, property_id, plan_id, plan_name, amount_paise, currency, razorpay_order_id, razorpay_payment_id, payment_status")
      .eq("id", body.featuredOrderId)
      .eq("owner_id", appUser.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    await supabaseAdmin
      .from("property_featured_orders")
      .update({ payment_status: "failed", activation_status: "failed", failure_reason: body.reason || "Payment failed in checkout", failed_at: new Date().toISOString() })
      .eq("id", order.id)
      .neq("payment_status", "paid");

    void notifyFeaturedPaymentEvent({
      supabaseAdmin,
      sellerId: order.owner_id,
      sellerName: appUser.full_name,
      sellerEmail: appUser.email,
      sellerPhone: appUser.phone,
      sellerWhatsapp: appUser.whatsapp_number,
      propertyId: order.property_id,
      planId: order.plan_id,
      planName: order.plan_name,
      localOrderId: order.id,
      razorpayOrderId: body.razorpay_order_id || order.razorpay_order_id,
      razorpayPaymentId: body.razorpay_payment_id || order.razorpay_payment_id,
      paymentStatus: "failed",
      activationStatus: "failed",
      amount: order.amount_paise,
      currency: order.currency,
      outcome: "failed",
      reason: body.reason,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[property-featured/payment-failure]", error);
    return NextResponse.json({ ok: false, error: "Unable to record payment failure" }, { status: 500 });
  }
}
