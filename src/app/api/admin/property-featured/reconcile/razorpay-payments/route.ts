import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

type LocalLookupResult = { local: any | null; matchedBy: "razorpay_order_id" | "razorpay_payment_id" | null; localLookupAttempted: boolean; localLookupFound: boolean };

const paidStatuses = new Set(["paid", "success", "captured"]);
const activeStatuses = new Set(["active", "scheduled"]);
const pendingStatuses = new Set(["created", "pending"]);
const cancelledOrFailedStatuses = new Set(["cancelled", "failed", "refunded"]);
const normalizeValue = (value: unknown) => String(value ?? "").trim();
const normalizeStatus = (value: unknown) => String(value ?? "").trim().toLowerCase();

function parseTime(input: string | null) { if (!input) return undefined; const n = Number(input); if (Number.isFinite(n) && n > 0) return Math.floor(n); const d = new Date(input); return Number.isNaN(d.getTime()) ? undefined : Math.floor(d.getTime() / 1000); }
function errorResponse(message: string, code: string, status: number) { return NextResponse.json({ error: message, code }, { status }); }
async function requireAdmin() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) }; const { data: profile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle(); if (!profile || !["admin", "super_admin"].includes(profile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) }; return { adminProfile: profile }; }

export async function GET(req: Request) {
  try {
    const adminAuth = await requireAdmin(); if ("error" in adminAuth) return adminAuth.error;
    const supabaseAdmin = createServiceClient();
    const url = new URL(req.url); const from = parseTime(url.searchParams.get("from")); const to = parseTime(url.searchParams.get("to")); const count = Math.min(100, Math.max(1, Number(url.searchParams.get("count") ?? 20))); const onlyCaptured = (url.searchParams.get("onlyCaptured") ?? "true") !== "false";

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: recentOrders } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, property_id, owner_id, plan_id, plan_key, plan_name, duration_days, amount_paise, currency, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, paid_at, cancelled_at, failed_at, refunded_at, featured_starts_at, featured_ends_at, created_at, updated_at, receipt")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    const localByRazorpayOrderId = new Map<string, any>();
    const localByRazorpayPaymentId = new Map<string, any>();

    for (const row of recentOrders ?? []) {
      const orderId = normalizeValue(row.razorpay_order_id);
      const paymentId = normalizeValue(row.razorpay_payment_id);
      if (orderId) localByRazorpayOrderId.set(orderId, row);
      if (paymentId) localByRazorpayPaymentId.set(paymentId, row);
    }

    console.info("[featured-reconcile/scanner] local map built", {
      recentOrderCount: (recentOrders ?? []).length,
      orderIdKeys: localByRazorpayOrderId.size,
      paymentIdKeys: localByRazorpayPaymentId.size,
    });

    const payments = await getRazorpayClient().payments.all({ count, ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const rows = onlyCaptured ? payments.items.filter((p) => p.status === "captured") : payments.items;

    const localLookupMap = new Map<string, LocalLookupResult>();
    for (const payment of rows) {
      const scannerOrderId = normalizeValue(payment.order_id);
      const scannerPaymentId = normalizeValue(payment.id);
      const localByOrder = scannerOrderId ? localByRazorpayOrderId.get(scannerOrderId) : null;
      const localByPayment = !localByOrder && scannerPaymentId ? localByRazorpayPaymentId.get(scannerPaymentId) : null;
      const local = localByOrder ?? localByPayment ?? null;
      const matchedBy = localByOrder ? "razorpay_order_id" : localByPayment ? "razorpay_payment_id" : null;
      localLookupMap.set(payment.id, { local, matchedBy, localLookupAttempted: true, localLookupFound: Boolean(local) });
    }

    const noLocalRows = rows.filter((p) => !localLookupMap.get(p.id)?.localLookupFound);
    const detectedOrders = await Promise.all(noLocalRows.map(async (payment) => {
      if (!payment.order_id) return [payment.id, null] as const;
      try {
        const order = await getRazorpayClient().orders.fetch(payment.order_id);
        return [payment.id, order] as const;
      } catch (error) {
        console.warn("[admin/property-featured/reconcile/razorpay-payments] order fetch failed", { payment_id: payment.id, razorpay_order_id: payment.order_id, error: error instanceof Error ? error.message : "unknown" });
        return [payment.id, null] as const;
      }
    }));
    const detectedOrderMap = new Map(detectedOrders);

    const data = await Promise.all(rows.map(async (p) => {
      const scannerOrderId = normalizeValue(p.order_id);
      const scannerPaymentId = normalizeValue(p.id);
      const localLookup = localLookupMap.get(p.id) ?? { local: null, matchedBy: null, localLookupAttempted: true, localLookupFound: false };
      const local = localLookup.local;
      const localPaymentStatus = normalizeStatus(local?.payment_status);
      const localActivationStatus = normalizeStatus(local?.activation_status);

      const alreadyReconciled = Boolean(local && (paidStatuses.has(localPaymentStatus) || activeStatuses.has(localActivationStatus)));
      const isPendingLocal = Boolean(local && (pendingStatuses.has(localPaymentStatus) || pendingStatuses.has(localActivationStatus)));
      const isCancelledOrFailed = Boolean(local && (cancelledOrFailedStatuses.has(localPaymentStatus) || cancelledOrFailedStatuses.has(localActivationStatus)));
      const amountMatchesLocal = Boolean(local && Number(local.amount_paise) === Number(p.amount));
      const currencyMatchesLocal = Boolean(local && normalizeValue(local.currency || "INR").toUpperCase() === normalizeValue(p.currency || "INR").toUpperCase());

      const canReconcile = Boolean(local && !alreadyReconciled && !isCancelledOrFailed && isPendingLocal && p.status === "captured" && amountMatchesLocal && currencyMatchesLocal);
      const duplicateWouldBeBlocked = Boolean(local);
      const canRecover = !local;

      const detectedOrder = !local ? detectedOrderMap.get(p.id) : null;
      const notes = detectedOrder?.notes as Record<string, unknown> | undefined;
      const detectedPurpose = typeof notes?.purpose === "string" ? notes.purpose : null;
      const detectedPropertyId = typeof notes?.property_id === "string" ? notes.property_id : null;
      const detectedOwnerId = typeof notes?.owner_id === "string" ? notes.owner_id : null;
      const detectedPlanId = typeof notes?.plan_id === "string" ? notes.plan_id : null;
      const detectedPlanKey = typeof notes?.plan_key === "string" ? notes.plan_key : null;

      const [{ data: detectedProperty }, { data: detectedPlan }] = (!local && detectedPropertyId)
        ? await Promise.all([
          supabaseAdmin.from("properties").select("id, title, status, deleted_at").eq("id", detectedPropertyId).maybeSingle(),
          (detectedPlanId || detectedPlanKey)
            ? supabaseAdmin.from("property_featured_plans").select("id, plan_key, name, amount_paise, currency, is_active").or([detectedPlanId ? `id.eq.${detectedPlanId}` : null, detectedPlanKey ? `plan_key.eq.${detectedPlanKey}` : null].filter(Boolean).join(",")).maybeSingle()
            : Promise.resolve({ data: null as any }),
        ])
        : [{ data: null as any }, { data: null as any }];

      const amountMatchesDetectedPlan = Boolean(detectedPlan && Number(detectedPlan.amount_paise) === Number(p.amount));
      const currencyMatchesDetectedPlan = Boolean(detectedPlan && normalizeValue(detectedPlan.currency || "INR").toUpperCase() === normalizeValue(p.currency || "INR").toUpperCase());
      const propertyEligible = Boolean(detectedProperty && detectedProperty.deleted_at === null && ["active", "approved"].includes(normalizeStatus(detectedProperty.status)));
      const canRecoverFromDetectedNotes = Boolean(!local && p.status === "captured" && detectedPurpose === "property_featured_listing" && detectedPropertyId && (detectedPlanId || detectedPlanKey) && propertyEligible && detectedPlan?.is_active && amountMatchesDetectedPlan && currencyMatchesDetectedPlan);

      const label = local
        ? alreadyReconciled
          ? "Already Reconciled"
          : canReconcile
            ? "Ready to Reconcile"
            : "Local Order Exists — Review"
        : canRecoverFromDetectedNotes
          ? "Detected Property/Plan"
          : "Needs Manual Review";

      console.info("[featured-reconcile/scanner] match result", { payment_id: p.id, payment_order_id: p.order_id ?? null, localOrderFound: Boolean(local), matchedBy: localLookup.matchedBy, localOrderId: local?.id ?? null, localPaymentStatus: local?.payment_status ?? null, localActivationStatus: local?.activation_status ?? null, label });

      return { payment_id: p.id, order_id: p.order_id ?? null, amount: Number(p.amount), currency: p.currency, status: p.status, method: p.method ?? null, contact: p.contact ?? null, email: p.email ?? null, created_at: new Date((p.created_at ?? 0) * 1000).toISOString(), localOrderFound: Boolean(local), localOrderId: local?.id ?? null, propertyId: local?.property_id ?? null, planKey: local?.plan_key ?? null, planName: local?.plan_name ?? null, localPaymentStatus: local?.payment_status ?? null, localActivationStatus: local?.activation_status ?? null, duplicateWouldBeBlocked, alreadyReconciled, canReconcile, canRecover, canRecoverFromDetectedNotes: !local && canRecoverFromDetectedNotes, label, matchedBy: localLookup.matchedBy, detectedFromRazorpayNotes: Boolean(detectedOrder && detectedPurpose), detectedPropertyId, detectedOwnerId, detectedPlanId, detectedPlanKey, detectedPurpose, detectedPropertyTitle: detectedProperty?.title ?? null, detectedPropertyStatus: detectedProperty?.status ?? null, detectedPlanName: detectedPlan?.name ?? null, detectedPlanAmountPaise: detectedPlan?.amount_paise ?? null, detectedPlanCurrency: detectedPlan?.currency ?? "INR", amountMatchesDetectedPlan, currencyMatchesDetectedPlan, localLookupAttempted: true, localLookupFound: Boolean(local), localLookupRecentOrderCount: (recentOrders ?? []).length, scannerPaymentId, scannerOrderId };
    }));

    return NextResponse.json({ success: true, count: data.length, data });
  } catch (error) { console.error("[admin/property-featured/reconcile/razorpay-payments] failed", error); return errorResponse("Failed to scan Razorpay payments.", "RAZORPAY_SCANNER_FAILED", 500); }
}
