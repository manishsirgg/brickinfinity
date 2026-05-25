import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) };
  const { data: profile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) };
  return { adminProfile: profile };
}

type QueryStage = "admin_guard" | "fetch_orders" | "fetch_properties" | "classify" | "response_build";
type QueueError = { code?: string | null; message?: string | null; details?: string | null; hint?: string | null };

const paidStatuses = new Set(["paid", "success", "captured"]);
const pendingStatuses = new Set(["created", "pending"]);
const activeStatuses = new Set(["active", "scheduled"]);
const terminalStatuses = new Set(["cancelled", "failed", "refunded"]);

const normalize = (value: unknown) => String(value ?? "").toLowerCase();
const isAlreadyPaidOrActive = (row: any) => paidStatuses.has(normalize(row.payment_status)) || activeStatuses.has(normalize(row.activation_status));
const isUnpaidOrPending = (row: any) => pendingStatuses.has(normalize(row.payment_status)) || pendingStatuses.has(normalize(row.activation_status));
const isStaleCancellable = (row: any) =>
  pendingStatuses.has(normalize(row.payment_status)) &&
  pendingStatuses.has(normalize(row.activation_status)) &&
  !row.razorpay_payment_id &&
  !row.paid_at &&
  !terminalStatuses.has(normalize(row.payment_status)) &&
  !terminalStatuses.has(normalize(row.activation_status));

const logQueueError = (error: QueueError | null | undefined, queryStage: QueryStage) => {
  console.error("[admin/property-featured/reconcile/queue] queue_fetch_failed", {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    queryStage,
  });
};

export async function GET(req: Request) {
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;

    const supabaseAdmin = createServiceClient();
    const checkRazorpay = new URL(req.url).searchParams.get("checkRazorpay") === "true";
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, property_id, owner_id, plan_id, plan_key, plan_name, duration_days, amount_paise, currency, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, paid_at, cancelled_at, failed_at, refunded_at, featured_starts_at, featured_ends_at, created_at, updated_at, receipt")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    if (ordersError) {
      logQueueError(ordersError, "fetch_orders");
      return errorResponse("Failed to fetch reconciliation queue.", "QUEUE_FETCH_FAILED", 500);
    }

    const propertyIds = Array.from(new Set((orders ?? []).map((row) => row.property_id).filter(Boolean)));
    let propertyMap = new Map<string, { title: string | null; status: string | null; is_featured: boolean | null; featured_until: string | null }>();

    if (propertyIds.length > 0) {
      const { data: properties, error: propertiesError } = await supabaseAdmin
        .from("properties")
        .select("id, title, status, is_featured, featured_until")
        .in("id", propertyIds);

      if (propertiesError) {
        logQueueError(propertiesError, "fetch_properties");
        return errorResponse("Failed to fetch reconciliation queue.", "QUEUE_FETCH_FAILED", 500);
      }

      propertyMap = new Map((properties ?? []).map((property) => [property.id, {
        title: property.title ?? null,
        status: property.status ?? null,
        is_featured: property.is_featured ?? null,
        featured_until: property.featured_until ?? null,
      }]));
    }

    const recentOrders = (orders ?? []).map((row) => {
      const propertyInfo = row.property_id ? propertyMap.get(row.property_id) : undefined;
      const alreadyPaidOrActive = isAlreadyPaidOrActive(row);
      const unpaidOrPending = isUnpaidOrPending(row);
      const staleCancellable = isStaleCancellable(row);
      const classification = alreadyPaidOrActive ? "already_paid_or_active" : unpaidOrPending ? "unpaid_or_pending" : "pending_unreconciled";

      return {
        local_order_id: row.id,
        property_id: row.property_id,
        property_title: propertyInfo?.title ?? null,
        property_status: propertyInfo?.status ?? null,
        property_is_featured: propertyInfo?.is_featured ?? null,
        property_featured_until: propertyInfo?.featured_until ?? null,
        owner_id: row.owner_id,
        plan_id: row.plan_id,
        plan_key: row.plan_key,
        plan_name: row.plan_name,
        duration_days: row.duration_days,
        amount_paise: row.amount_paise,
        currency: row.currency,
        payment_status: row.payment_status,
        activation_status: row.activation_status,
        razorpay_order_id: row.razorpay_order_id,
        razorpay_payment_id: row.razorpay_payment_id,
        paid_at: row.paid_at,
        cancelled_at: row.cancelled_at,
        failed_at: row.failed_at,
        refunded_at: row.refunded_at,
        featured_starts_at: row.featured_starts_at,
        featured_ends_at: row.featured_ends_at,
        receipt: row.receipt,
        created_at: row.created_at,
        updated_at: row.updated_at,
        classification,
        alreadyPaidOrActive,
        unpaidOrPending,
        staleCancellable,
        can_reconcile: !alreadyPaidOrActive,
      };
    });

    const queueBase = recentOrders.filter((row) => row.can_reconcile);

    const queue = await Promise.all(queueBase.map(async (row) => {
      let razorpayStatus = null;
      if (checkRazorpay && row.razorpay_order_id) {
        try {
          const payments = await getRazorpayClient().orders.fetchPayments(row.razorpay_order_id);
          const captured = payments.items.find((p) => p.status === "captured" && p.order_id === row.razorpay_order_id);
          razorpayStatus = {
            hasCapturedPayment: Boolean(captured),
            capturedPaymentId: captured?.id ?? null,
            paymentStatus: captured?.status ?? payments.items[0]?.status ?? null,
            amount: captured?.amount ?? null,
            currency: captured?.currency ?? null,
            amountMatches: captured ? Number(captured.amount) === Number(row.amount_paise) : false,
            currencyMatches: captured ? String(captured.currency || "").toUpperCase() === String(row.currency || "INR").toUpperCase() : false,
            capturedAt: captured?.created_at ? new Date(captured.created_at * 1000).toISOString() : null,
          };
        } catch {
          razorpayStatus = { hasCapturedPayment: false, capturedPaymentId: null, paymentStatus: "check_failed", amount: null, currency: null, amountMatches: false, currencyMatches: false, capturedAt: null };
        }
      }
      return { ...row, razorpayStatus };
    }));

    const diagnostics = {
      totalRecentFeaturedOrders: recentOrders.length,
      withRazorpayOrderId: recentOrders.filter((row) => Boolean(row.razorpay_order_id)).length,
      unpaidOrPending: recentOrders.filter((row) => row.unpaidOrPending).length,
      alreadyPaidOrActive: recentOrders.filter((row) => row.alreadyPaidOrActive).length,
      hiddenByStatusFilter: recentOrders.length - queue.length,
      returnedQueueCount: queue.length,
    };

    const debug = {
      debugTableReadAttempted: true,
      debugRecentOrderCount: recentOrders.length,
      debugFirstRecentOrderId: recentOrders[0]?.local_order_id ?? null,
    };

    return NextResponse.json({ queue, recentOrders, diagnostics, debug });
  } catch (error) {
    console.error("[admin/property-featured/reconcile/queue] unhandled", error);
    logQueueError({ message: error instanceof Error ? error.message : "Unhandled error" }, "response_build");
    return errorResponse("Queue request failed.", "QUEUE_REQUEST_FAILED", 500);
  }
}
