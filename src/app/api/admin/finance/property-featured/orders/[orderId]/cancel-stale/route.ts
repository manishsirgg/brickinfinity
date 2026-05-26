import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isPending, STALE_PENDING_CANCEL_REASON, STALE_PENDING_MINUTES } from "@/lib/admin-finance";

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) };

  const { data: adminProfile, error } = await supabase
    .from("users")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !adminProfile || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) };
  }

  return { adminProfile };
}

export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  console.info("[admin-finance/cancel-stale] start");
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;

    const { orderId } = await params;
    if (!orderId) return errorResponse("orderId is required.", "ORDER_ID_REQUIRED", 400);

    const supabaseAdmin = createServiceClient();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, created_at, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, failure_reason, metadata, paid_at")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) return errorResponse("Featured order not found.", "FEATURED_ORDER_NOT_FOUND", 404);

    const paymentStatus = String(order.payment_status ?? "").toLowerCase();
    const activationStatus = String(order.activation_status ?? "").toLowerCase();

    const blocked = !isPending(paymentStatus)
      || Boolean(order.razorpay_payment_id)
      || Boolean(order.paid_at)
      || ["active", "scheduled"].includes(activationStatus)
      || ["paid", "success", "captured"].includes(paymentStatus);

    const staleBefore = new Date(Date.now() - STALE_PENDING_MINUTES * 60 * 1000);
    const isStaleByAge = new Date(order.created_at) <= staleBefore;

    if (blocked || !isStaleByAge) {
      console.warn("[admin-finance/cancel-stale] blocked_paid_or_active", { orderId: order.id, paymentStatus, activationStatus });
      return errorResponse("Order does not meet stale pending cancellation criteria.", "STALE_CANCEL_BLOCKED", 409);
    }

    // TODO: if razorpay_order_id exists, optionally fetch Razorpay order/payments status before local cancellation.
    const { error: updateError } = await supabaseAdmin
      .from("property_featured_orders")
      .update({
        payment_status: "cancelled",
        activation_status: "cancelled",
        failure_reason: STALE_PENDING_CANCEL_REASON,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .in("payment_status", ["pending", "created", "unpaid"])
      .or("razorpay_payment_id.is.null,razorpay_payment_id.eq.")
      .not("activation_status", "in", "(active,scheduled)");

    if (updateError) throw updateError;

    console.info("[admin-finance/cancel-stale] cancelled", { orderId: order.id });
    return NextResponse.json({ ok: true, status: "cancelled", message: "Stale pending order cancelled." });
  } catch (error) {
    console.error("[admin-finance/cancel-stale] failed", error);
    return errorResponse("Cancel stale pending request failed.", "CANCEL_STALE_FAILED", 500);
  }
}
