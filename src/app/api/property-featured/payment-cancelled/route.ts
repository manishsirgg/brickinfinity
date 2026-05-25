import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type CancelBody = {
  featuredOrderId?: string;
  razorpayOrderId?: string;
  reason?: string;
};

const PAID_STATUSES = new Set(["paid", "success", "captured"]);
const PENDING_STATUSES = new Set(["pending", "created", "unpaid"]);

type CancelledResponse = {
  ok: true;
  status: "cancelled" | "paid" | "active" | "scheduled";
  message: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as CancelBody;
    if (!body.featuredOrderId) {
      return NextResponse.json({ ok: false, error: "Missing featuredOrderId" }, { status: 400 });
    }

    const { data: appUser } = await supabase.from("users").select("id").eq("user_id", user.id).maybeSingle();
    if (!appUser) return NextResponse.json({ ok: false, error: "User profile not found" }, { status: 404 });

    const { data: order } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, owner_id, razorpay_order_id, razorpay_payment_id, payment_status, activation_status")
      .eq("id", body.featuredOrderId)
      .eq("owner_id", appUser.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });

    if (body.razorpayOrderId && order.razorpay_order_id && body.razorpayOrderId !== order.razorpay_order_id) {
      return NextResponse.json({ ok: false, error: "Razorpay order mismatch" }, { status: 400 });
    }

    const paymentStatus = String(order.payment_status ?? "").toLowerCase();
    const activationStatus = String(order.activation_status ?? "").toLowerCase();

    if (PAID_STATUSES.has(paymentStatus) || Boolean(order.razorpay_payment_id) || activationStatus === "active" || activationStatus === "scheduled") {
      const safeStatus = activationStatus === "active" || activationStatus === "scheduled" ? activationStatus : "paid";
      return NextResponse.json({ ok: true, status: safeStatus, message: "Payment already completed for this listing." } satisfies CancelledResponse);
    }

    if (!PENDING_STATUSES.has(paymentStatus)) {
      return NextResponse.json({ ok: true, status: "cancelled", message: "Payment was cancelled. Your listing was not activated." } satisfies CancelledResponse);
    }

    await supabaseAdmin
      .from("property_featured_orders")
      .update({
        payment_status: "cancelled",
        activation_status: "cancelled",
        failure_reason: "User cancelled Razorpay checkout before payment.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("owner_id", appUser.id)
      .in("payment_status", ["pending", "created", "unpaid"])
      .is("razorpay_payment_id", null)
      .neq("activation_status", "active")
      .neq("activation_status", "scheduled");

    return NextResponse.json({ ok: true, status: "cancelled", message: "Payment was cancelled. Your listing was not activated." } satisfies CancelledResponse);
  } catch (error) {
    console.error("[property-featured/payment-cancelled]", error);
    return NextResponse.json({ ok: false, error: "Unable to record payment cancellation" }, { status: 500 });
  }
}
