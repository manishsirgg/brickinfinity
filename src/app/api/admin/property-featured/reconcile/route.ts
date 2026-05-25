import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

type ReconcileBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  local_order_id?: string;
  featured_order_id?: string;
};

type LocalFeaturedOrder = {
  id: string;
  property_id: string;
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  amount_paise: number;
  currency: string | null;
  payment_status: string | null;
  activation_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
};

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) };

  const { data: adminProfile, error: profileError } = await supabase
    .from("users")
    .select("id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = adminProfile?.role === "admin" || adminProfile?.role === "super_admin";
  if (profileError || !adminProfile || !isAdmin) {
    return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) };
  }

  return { adminProfile };
}

async function getCapturedPayment(razorpayOrderId: string, paymentId?: string) {
  if (paymentId) {
    const payment = await getRazorpayClient().payments.fetch(paymentId);
    return {
      id: payment.id,
      status: payment.status,
      order_id: payment.order_id,
      amount: Number(payment.amount),
      currency: payment.currency,
      created_at: payment.created_at,
    };
  }

  const orderPayments = await getRazorpayClient().orders.fetchPayments(razorpayOrderId);
  const captured = orderPayments.items.find(
    (payment) => payment.status === "captured" && payment.order_id === razorpayOrderId
  );

  if (!captured) return null;

  return {
    id: captured.id,
    status: captured.status,
    order_id: captured.order_id,
    amount: Number(captured.amount),
    currency: captured.currency,
    created_at: captured.created_at,
  };
}

async function getLocalOrder(supabaseAdmin: ReturnType<typeof createServiceClient>, body: ReconcileBody) {
  const orderId = body.local_order_id ?? body.featured_order_id;

  const baseSelect =
    "id, property_id, plan_id, plan_key, plan_name, amount_paise, currency, payment_status, activation_status, razorpay_order_id, razorpay_payment_id";

  if (orderId) {
    const { data, error } = await supabaseAdmin
      .from("property_featured_orders")
      .select(baseSelect)
      .eq("id", orderId)
      .maybeSingle();
    return { data: data as LocalFeaturedOrder | null, error };
  }

  if (!body.razorpay_order_id) return { data: null, error: null };

  const { data, error } = await supabaseAdmin
    .from("property_featured_orders")
    .select(baseSelect)
    .eq("razorpay_order_id", body.razorpay_order_id)
    .maybeSingle();
  return { data: data as LocalFeaturedOrder | null, error };
}

export async function POST(req: Request) {
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;

    const supabaseAdmin = createServiceClient();
    const body = (await req.json()) as ReconcileBody;

    const queueModeOrderId = body.local_order_id ?? body.featured_order_id;
    if (!queueModeOrderId && !body?.razorpay_order_id) {
      return errorResponse(
        "Provide razorpay_order_id for manual mode, or local_order_id/featured_order_id for queue mode.",
        "ORDER_IDENTIFIER_REQUIRED",
        400
      );
    }

    const { data: order, error: orderError } = await getLocalOrder(supabaseAdmin, body);

    if (orderError || !order) {
      return errorResponse("Featured order not found locally.", "FEATURED_ORDER_NOT_FOUND", 404, {
        local_order_id: queueModeOrderId ?? null,
        razorpay_order_id: body.razorpay_order_id ?? null,
      });
    }

    const razorpayOrderId = order.razorpay_order_id ?? body.razorpay_order_id;
    if (!razorpayOrderId) {
      return errorResponse("Razorpay order ID missing on local order.", "RAZORPAY_ORDER_ID_MISSING", 400, {
        local_order_id: order.id,
      });
    }

    const fetchedPayment = await getCapturedPayment(razorpayOrderId, body.razorpay_payment_id);
    if (!fetchedPayment) {
      return errorResponse("No captured payment found in Razorpay for this order.", "CAPTURED_PAYMENT_NOT_FOUND", 404, {
        local_order_id: order.id,
        razorpay_order_id: razorpayOrderId,
      });
    }

    const amountMatches = Number(order.amount_paise) === Number(fetchedPayment.amount);
    const currencyMatches = (order.currency || "INR").toUpperCase() === fetchedPayment.currency.toUpperCase();
    const orderIdMatches = fetchedPayment.order_id === razorpayOrderId;

    if (fetchedPayment.status !== "captured" || !orderIdMatches || !amountMatches || !currencyMatches) {
      return errorResponse("Razorpay payment did not pass reconciliation checks.", "RECONCILIATION_VALIDATION_FAILED", 400, {
        local_order_id: order.id,
        paymentStatus: fetchedPayment.status,
        orderIdMatches,
        amountMatches,
        currencyMatches,
        localAmountPaise: order.amount_paise,
        razorpayAmountPaise: fetchedPayment.amount,
        localCurrency: order.currency,
        razorpayCurrency: fetchedPayment.currency,
      });
    }

    if (order.payment_status === "paid" && order.activation_status === "active") {
      return NextResponse.json({
        success: true,
        status: "already_reconciled",
        message: "Featured payment was already reconciled.",
        data: {
          local_order_id: order.id,
          property_id: order.property_id,
          plan: order.plan_name || order.plan_key,
          amount_paise: order.amount_paise,
          currency: order.currency,
          razorpay_payment_id: order.razorpay_payment_id ?? fetchedPayment.id,
          payment_status: order.payment_status,
          activation_status: order.activation_status,
          activation_result: "already_active",
        },
      });
    }

    const updateData: Record<string, unknown> = {
      payment_status: "paid",
      status: "success",
      razorpay_payment_id: fetchedPayment.id,
      paid_at: new Date().toISOString(),
      metadata: {
        reconciliation: {
          reconciled_at: new Date().toISOString(),
          reconciled_by: adminAuth.adminProfile.id,
          razorpay_payment_id: fetchedPayment.id,
        },
      },
    };

    const { error: updateError } = await supabaseAdmin.from("property_featured_orders").update(updateData).eq("id", order.id);
    if (updateError) {
      return errorResponse("Failed to update local featured order.", "FEATURED_ORDER_UPDATE_FAILED", 500, {
        orderId: order.id,
      });
    }

    const { error: activationError } = await supabaseAdmin.rpc("activate_property_featured_order", {
      p_order_id: order.id,
      p_razorpay_payment_id: fetchedPayment.id,
      p_razorpay_signature: null,
    });

    if (activationError) {
      console.error("[admin/property-featured/reconcile] activation failed", {
        adminProfileId: adminAuth.adminProfile.id,
        localOrderId: order.id,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: fetchedPayment.id,
        activationError: activationError.message,
      });
      return errorResponse("Payment verified, but featured activation failed.", "ACTIVATION_FAILED", 500);
    }

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, title, featured_started_at, featured_until")
      .eq("id", order.property_id)
      .maybeSingle();

    console.info("[admin/property-featured/reconcile] success", {
      adminProfileId: adminAuth.adminProfile.id,
      localOrderId: order.id,
      razorpay_order_id: razorpayOrderId,
      capturedPaymentId: fetchedPayment.id,
      amountMatches,
      currencyMatches,
      activationResult: "success",
    });

    return NextResponse.json({
      success: true,
      status: "reconciled",
      message: "Featured payment reconciled and activation completed.",
      data: {
        local_order_id: order.id,
        property_id: order.property_id,
        property_title: property?.title ?? null,
        plan: order.plan_name || order.plan_key,
        amount_paise: order.amount_paise,
        currency: order.currency,
        razorpay_payment_id: fetchedPayment.id,
        payment_status: "paid",
        activation_status: "active",
        activation_result: "activated",
        activation: {
          featured_starts_at: property?.featured_started_at ?? null,
          featured_ends_at: property?.featured_until ?? null,
        },
      },
    });
  } catch (error) {
    console.error("[admin/property-featured/reconcile] unhandled", error);
    return errorResponse("Reconciliation failed.", "RECONCILIATION_FAILED", 500);
  }
}
