import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
}
async function requireAdmin() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) }; const { data: profile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle(); if (!profile || !["admin", "super_admin"].includes(profile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) }; return { adminProfile: profile }; }

const paidStatuses = new Set(["paid", "success", "captured"]);
const isPaidOrActive = (row: any) => paidStatuses.has(String(row.payment_status ?? "").toLowerCase()) || paidStatuses.has(String(row.status ?? "").toLowerCase()) || String(row.activation_status ?? "").toLowerCase() === "active";

export async function GET(req: Request) {
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;
    const supabaseAdmin = createServiceClient();
    const checkRazorpay = new URL(req.url).searchParams.get("checkRazorpay") === "true";
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data: orders, error } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, property_id, owner_id, plan_id, plan_key, plan_name, amount_paise, currency, status, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, receipt, created_at, updated_at, properties:property_id (title)")
      .not("razorpay_order_id", "is", null)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return errorResponse("Failed to fetch reconciliation queue.", "QUEUE_FETCH_FAILED", 500);

    const recentOrders = (orders ?? []).map((row) => {
      const alreadyPaidOrActive = isPaidOrActive(row);
      const classification = alreadyPaidOrActive ? "already_paid_or_active" : "pending_unreconciled";
      return {
        local_order_id: row.id, property_id: row.property_id, property_title: (row.properties as { title?: string } | null)?.title ?? null, owner_id: row.owner_id, plan_id: row.plan_id, plan_key: row.plan_key, plan_name: row.plan_name, amount_paise: row.amount_paise, currency: row.currency, status: row.status, payment_status: row.payment_status, activation_status: row.activation_status, razorpay_order_id: row.razorpay_order_id, razorpay_payment_id: row.razorpay_payment_id, receipt: row.receipt, created_at: row.created_at, updated_at: row.updated_at,
        classification, classification_reason: alreadyPaidOrActive ? "Local order already marked paid/success/captured or active" : "Local order still pending and reconcilable", can_reconcile: !alreadyPaidOrActive,
      };
    });

    const queue = recentOrders.filter((x) => x.can_reconcile);
    const enriched = await Promise.all(queue.map(async (row) => {
      let razorpayStatus = null;
      if (checkRazorpay && row.razorpay_order_id) {
        try { const payments = await getRazorpayClient().orders.fetchPayments(row.razorpay_order_id); const captured = payments.items.find((p) => p.status === "captured" && p.order_id === row.razorpay_order_id); razorpayStatus = { hasCapturedPayment: Boolean(captured), capturedPaymentId: captured?.id ?? null, paymentStatus: captured?.status ?? payments.items[0]?.status ?? null, amount: captured?.amount ?? null, currency: captured?.currency ?? null, amountMatches: captured ? Number(captured.amount) === Number(row.amount_paise) : false, currencyMatches: captured ? String(captured.currency || "").toUpperCase() === String(row.currency || "INR").toUpperCase() : false, capturedAt: captured?.created_at ? new Date(captured.created_at * 1000).toISOString() : null }; } catch { razorpayStatus = { hasCapturedPayment: false, capturedPaymentId: null, paymentStatus: "check_failed", amount: null, currency: null, amountMatches: false, currencyMatches: false, capturedAt: null }; }
      }
      return { ...row, razorpayStatus };
    }));

    const diagnostics = { totalRecentFeaturedOrders: recentOrders.length, withRazorpayOrderId: recentOrders.filter((x) => Boolean(x.razorpay_order_id)).length, unpaidOrPending: recentOrders.filter((x) => x.can_reconcile).length, alreadyPaidOrActive: recentOrders.filter((x) => !x.can_reconcile).length, hiddenByStatusFilter: recentOrders.length - queue.length, returnedQueueCount: enriched.length };
    console.info("[admin/property-featured/reconcile/queue] diagnostics", diagnostics);
    return NextResponse.json({ success: true, diagnostics, queue: enriched, recentOrders });
  } catch (error) { console.error("[admin/property-featured/reconcile/queue] unhandled", error); return errorResponse("Queue request failed.", "QUEUE_REQUEST_FAILED", 500); }
}
