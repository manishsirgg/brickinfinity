import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

type ReconcileBody = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
};

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}

async function hasColumn(supabaseAdmin: ReturnType<typeof createServiceClient>, columnName: string) {
  const { data } = await supabaseAdmin
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "property_featured_orders")
    .eq("column_name", columnName)
    .maybeSingle();

  return Boolean(data?.column_name);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("Authentication required.", "UNAUTHENTICATED", 401);
    }

    const { data: adminProfile, error: profileError } = await supabase
      .from("users")
      .select("id, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = adminProfile?.role === "admin" || adminProfile?.role === "super_admin";

    if (profileError || !adminProfile || !isAdmin) {
      return errorResponse("Admin access required.", "FORBIDDEN", 403);
    }

    const body = (await req.json()) as ReconcileBody;

    if (!body?.razorpay_order_id) {
      return errorResponse("Razorpay order ID is required.", "RAZORPAY_ORDER_ID_REQUIRED", 400);
    }

    let fetchedPayment: {
      id: string;
      status: string;
      order_id: string;
      amount: number;
      currency: string;
    } | null = null;

    if (body.razorpay_payment_id) {
      const payment = await getRazorpayClient().payments.fetch(body.razorpay_payment_id);
      fetchedPayment = {
        id: payment.id,
        status: payment.status,
        order_id: payment.order_id,
        amount: Number(payment.amount),
        currency: payment.currency,
      };
    } else {
      const orderPayments = await getRazorpayClient().orders.fetchPayments(body.razorpay_order_id);
      const captured = orderPayments.items.find(
        (payment) => payment.status === "captured" && payment.order_id === body.razorpay_order_id
      );
      if (captured) {
        fetchedPayment = {
          id: captured.id,
          status: captured.status,
          order_id: captured.order_id,
          amount: Number(captured.amount),
          currency: captured.currency,
        };
      }
    }

    if (!fetchedPayment) {
      return errorResponse("No captured payment found in Razorpay for this order.", "CAPTURED_PAYMENT_NOT_FOUND", 404, {
        razorpay_order_id: body.razorpay_order_id,
      });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from("property_featured_orders")
      .select(
        "id, property_id, plan_id, plan_key, plan_name, amount_paise, currency, payment_status, activation_status, razorpay_order_id, razorpay_payment_id"
      )
      .eq("razorpay_order_id", body.razorpay_order_id)
      .maybeSingle();

    if (orderError || !order) {
      console.info("[admin/property-featured/reconcile] order not found", {
        adminProfileId: adminProfile.id,
        razorpay_order_id: body.razorpay_order_id,
        razorpay_payment_id: fetchedPayment.id,
        paymentStatus: fetchedPayment.status,
        localOrderFound: false,
      });

      return errorResponse("Featured order not found locally.", "FEATURED_ORDER_NOT_FOUND", 404, {
        razorpay_order_id: body.razorpay_order_id,
        razorpay_payment_id: fetchedPayment.id,
        paymentStatus: fetchedPayment.status,
        note: "Manual investigation is required.",
      });
    }

    const amountMatches = Number(order.amount_paise) === Number(fetchedPayment.amount);
    const currencyMatches = (order.currency || "INR").toUpperCase() === fetchedPayment.currency.toUpperCase();
    const orderIdMatches = fetchedPayment.order_id === body.razorpay_order_id;

    if (fetchedPayment.status !== "captured" || !orderIdMatches || !amountMatches || !currencyMatches) {
      return errorResponse("Razorpay payment did not pass reconciliation checks.", "RECONCILIATION_VALIDATION_FAILED", 400, {
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
          payment_status: order.payment_status,
          activation_status: order.activation_status,
        },
      });
    }

    const updateData: Record<string, unknown> = { payment_status: "paid" };
    if (await hasColumn(supabaseAdmin, "status")) updateData.status = "success";
    if (await hasColumn(supabaseAdmin, "razorpay_payment_id")) updateData.razorpay_payment_id = fetchedPayment.id;
    if (await hasColumn(supabaseAdmin, "paid_at")) updateData.paid_at = new Date().toISOString();
    if (await hasColumn(supabaseAdmin, "metadata")) {
      updateData.metadata = {
        reconciliation: {
          reconciled_at: new Date().toISOString(),
          reconciled_by: adminProfile.id,
          razorpay_payment_id: fetchedPayment.id,
        },
      };
    }

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
        adminProfileId: adminProfile.id,
        localOrderId: order.id,
        razorpay_order_id: body.razorpay_order_id,
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
      adminProfileId: adminProfile.id,
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: fetchedPayment.id,
      razorpayPaymentStatus: fetchedPayment.status,
      localOrderFound: true,
      localOrderId: order.id,
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
        payment_status: "paid",
        activation_status: "active",
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
