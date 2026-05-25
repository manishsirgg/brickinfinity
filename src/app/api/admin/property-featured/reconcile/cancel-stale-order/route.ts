import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

type CancelBody = { local_order_id?: string };

const cancellablePaymentStatuses = new Set(["created", "pending"]);
const cancellableActivationStatuses = new Set(["created", "pending"]);
const nonCancellablePaymentStatuses = new Set(["paid", "success", "captured", "refunded"]);
const nonCancellableActivationStatuses = new Set(["active", "refunded"]);

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) };
  const { data: adminProfile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle();
  if (!adminProfile || !["admin", "super_admin"].includes(adminProfile.role)) {
    return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) };
  }
  return { adminProfile };
}

function canCancelLocally(order: any) {
  const paymentStatus = String(order.payment_status ?? "").toLowerCase();
  const activationStatus = String(order.activation_status ?? "").toLowerCase();
  return cancellablePaymentStatuses.has(paymentStatus) && cancellableActivationStatuses.has(activationStatus) && !order.razorpay_payment_id && !order.paid_at;
}

export async function POST(req: Request) {
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;

    const body = (await req.json()) as CancelBody;
    if (!body.local_order_id) return errorResponse("local_order_id is required.", "LOCAL_ORDER_ID_REQUIRED", 400);

    const supabaseAdmin = createServiceClient();
    const { data: order, error: orderError } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, property_id, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, paid_at")
      .eq("id", body.local_order_id)
      .maybeSingle();
    if (orderError || !order) return errorResponse("Featured order not found.", "FEATURED_ORDER_NOT_FOUND", 404);

    const paymentStatus = String(order.payment_status ?? "").toLowerCase();
    const activationStatus = String(order.activation_status ?? "").toLowerCase();

    if (paymentStatus === "cancelled" && activationStatus === "cancelled") {
      return NextResponse.json({ success: true, status: "already_cancelled", message: "Order is already cancelled.", data: { local_order_id: order.id } });
    }

    if (nonCancellablePaymentStatuses.has(paymentStatus) || nonCancellableActivationStatuses.has(activationStatus) || order.razorpay_payment_id || order.paid_at) {
      return errorResponse("This order cannot be cancelled because it appears paid/active/refunded. Reconcile instead.", "ORDER_NOT_CANCELLABLE", 409, { local_order_id: order.id, payment_status: order.payment_status, activation_status: order.activation_status, razorpay_payment_id: order.razorpay_payment_id, paid_at: order.paid_at });
    }

    if (!canCancelLocally(order)) {
      return errorResponse("Order does not meet stale unpaid cancellation criteria.", "STALE_CRITERIA_NOT_MET", 400, { local_order_id: order.id, payment_status: order.payment_status, activation_status: order.activation_status });
    }

    if (order.razorpay_order_id) {
      const razorpayPayments = await getRazorpayClient().orders.fetchPayments(order.razorpay_order_id);
      const captured = razorpayPayments.items.find((p) => p.status === "captured" && p.order_id === order.razorpay_order_id);
      if (captured) {
        return errorResponse("Captured payment exists in Razorpay. Reconcile this order instead of cancelling.", "CAPTURED_PAYMENT_EXISTS", 409, { local_order_id: order.id, razorpay_payment_id: captured.id, razorpay_order_id: order.razorpay_order_id });
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("property_featured_orders")
      .update({
        payment_status: "cancelled",
        activation_status: "cancelled",
        cancelled_at: now,
        failure_reason: "Stale unpaid Razorpay order cancelled by admin.",
        admin_note: `cancelled_by_admin:${adminAuth.adminProfile.id};source:admin_reconciliation`,
        updated_at: now,
      })
      .eq("id", order.id);

    if (updateError) return errorResponse("Failed to cancel stale order.", "CANCEL_STALE_UPDATE_FAILED", 500);

    return NextResponse.json({ success: true, status: "cancelled", message: "Stale unpaid featured order cancelled.", data: { local_order_id: order.id } });
  } catch (error) {
    console.error("[admin/property-featured/reconcile/cancel-stale-order] failed", error);
    return errorResponse("Cancel stale order request failed.", "CANCEL_STALE_REQUEST_FAILED", 500);
  }
}

