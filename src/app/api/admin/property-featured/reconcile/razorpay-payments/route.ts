import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";

function parseTime(input: string | null) { if (!input) return undefined; const n = Number(input); if (Number.isFinite(n) && n > 0) return Math.floor(n); const d = new Date(input); return Number.isNaN(d.getTime()) ? undefined : Math.floor(d.getTime() / 1000); }
function errorResponse(message: string, code: string, status: number) { return NextResponse.json({ error: message, code }, { status }); }
async function requireAdmin() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) }; const { data: profile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle(); if (!profile || !["admin", "super_admin"].includes(profile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) }; return { adminProfile: profile }; }

export async function GET(req: Request) {
  try {
    const adminAuth = await requireAdmin(); if ("error" in adminAuth) return adminAuth.error;
    const supabaseAdmin = createServiceClient();
    const url = new URL(req.url); const from = parseTime(url.searchParams.get("from")); const to = parseTime(url.searchParams.get("to")); const count = Math.min(100, Math.max(1, Number(url.searchParams.get("count") ?? 20))); const onlyCaptured = (url.searchParams.get("onlyCaptured") ?? "true") !== "false";
    const payments = await getRazorpayClient().payments.all({ count, ...(from ? { from } : {}), ...(to ? { to } : {}) });
    const rows = onlyCaptured ? payments.items.filter((p) => p.status === "captured") : payments.items;
    const orderIds = rows.map((p) => p.order_id).filter(Boolean) as string[];
    const paymentIds = rows.map((p) => p.id).filter(Boolean) as string[];
    const { data: localOrders } = (orderIds.length || paymentIds.length)
      ? await supabaseAdmin
          .from("property_featured_orders")
          .select("id, property_id, plan_name, plan_key, payment_status, activation_status, status, razorpay_order_id, razorpay_payment_id, properties:property_id(title)")
          .or([
            orderIds.length ? `razorpay_order_id.in.(${orderIds.map((id) => `\"${id}\"`).join(",")})` : null,
            paymentIds.length ? `razorpay_payment_id.in.(${paymentIds.map((id) => `\"${id}\"`).join(",")})` : null,
          ].filter(Boolean).join(","))
      : { data: [] as any[] };
    const orderMap = new Map((localOrders ?? []).map((o) => [o.razorpay_order_id, o]));
    const paymentMap = new Map((localOrders ?? []).map((o) => [o.razorpay_payment_id, o]));

    const noLocalRows = rows.filter((p) => !(p.order_id && orderMap.get(p.order_id)) && !paymentMap.get(p.id));
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
      const matchedBy = p.order_id && orderMap.get(p.order_id)
        ? "razorpay_order_id"
        : paymentMap.get(p.id)
          ? "razorpay_payment_id"
          : null;
      const local = matchedBy === "razorpay_order_id"
        ? (p.order_id ? orderMap.get(p.order_id) : null)
        : paymentMap.get(p.id) ?? null;
      const localPaymentStatus = String(local?.payment_status ?? "").toLowerCase();
      const localActivationStatus = String(local?.activation_status ?? "").toLowerCase();
      const alreadyReconciled = Boolean(local && (["paid", "success", "captured"].includes(localPaymentStatus) || ["active", "scheduled"].includes(localActivationStatus)));
      const canReconcile = Boolean(local && !alreadyReconciled && p.status === "captured");
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

      const detectedFromRazorpayNotes = Boolean(detectedOrder && detectedPurpose);
      const detectedPropertyStatus = detectedProperty?.status ?? null;
      const detectedPropertyTitle = detectedProperty?.title ?? null;
      const detectedPlanName = detectedPlan?.name ?? null;
      const detectedPlanAmountPaise = detectedPlan?.amount_paise ?? null;
      const detectedPlanCurrency = detectedPlan?.currency ?? "INR";
      const amountMatchesDetectedPlan = Boolean(detectedPlan && Number(detectedPlan.amount_paise) === Number(p.amount));
      const currencyMatchesDetectedPlan = Boolean(detectedPlan && String(detectedPlan.currency || "INR").toUpperCase() === String(p.currency || "INR").toUpperCase());
      const propertyEligible = Boolean(detectedProperty && detectedProperty.deleted_at === null && ["active", "approved"].includes(String(detectedProperty.status ?? "").toLowerCase()));
      const detectedPlanActive = Boolean(detectedPlan?.is_active);
      const canRecoverFromDetectedNotes = Boolean(
        !local &&
        p.status === "captured" &&
        detectedPurpose === "property_featured_listing" &&
        detectedPropertyId &&
        (detectedPlanId || detectedPlanKey) &&
        propertyEligible &&
        detectedPlanActive &&
        amountMatchesDetectedPlan &&
        currencyMatchesDetectedPlan
      );

      const label = alreadyReconciled
        ? "Already Reconciled"
        : canReconcile
          ? "Ready to Reconcile"
          : canRecoverFromDetectedNotes
            ? "Detected Property/Plan"
            : "Needs Manual Review";
      console.info("[admin/property-featured/reconcile/razorpay-payments] detected notes", { payment_id: p.id, razorpay_order_id: p.order_id ?? null, detectedPurpose, detectedPropertyId, detectedPlanKey, detectedOwnerId, amountMatchesDetectedPlan, canRecoverFromDetectedNotes });
      console.info("[admin/property-featured/reconcile/razorpay-payments] payment match", { payment_id: p.id, payment_order_id: p.order_id ?? null, matchedBy, localOrderId: local?.id ?? null, localPaymentStatus: local?.payment_status ?? null, localActivationStatus: local?.activation_status ?? null, alreadyReconciled, canReconcile, canRecover });
      return { payment_id: p.id, order_id: p.order_id ?? null, amount: Number(p.amount), currency: p.currency, status: p.status, method: p.method ?? null, contact: p.contact ?? null, email: p.email ?? null, created_at: new Date((p.created_at ?? 0) * 1000).toISOString(), localOrderFound: Boolean(local), localOrderId: local?.id ?? null, propertyId: local?.property_id ?? null, propertyTitle: (local?.properties as { title?: string } | null)?.title ?? null, plan: local?.plan_name ?? local?.plan_key ?? null, localPaymentStatus: local?.payment_status ?? null, localActivationStatus: local?.activation_status ?? null, localStatus: local?.status ?? null, alreadyReconciled, canReconcile, canRecover, label, matchedBy, detectedFromRazorpayNotes, detectedPropertyId, detectedOwnerId, detectedPlanId, detectedPlanKey, detectedPurpose, detectedPropertyTitle, detectedPropertyStatus, detectedPlanName, detectedPlanAmountPaise, detectedPlanCurrency, amountMatchesDetectedPlan, currencyMatchesDetectedPlan, canRecoverFromDetectedNotes };
    }));
    console.info("[admin/property-featured/reconcile/razorpay-payments] scanner", { requestedCount: count, returned: data.length, onlyCaptured, matches: data.filter((d) => d.localOrderFound).length });
    return NextResponse.json({ success: true, count: data.length, data });
  } catch (error) { console.error("[admin/property-featured/reconcile/razorpay-payments] failed", error); return errorResponse("Failed to scan Razorpay payments.", "RAZORPAY_SCANNER_FAILED", 500); }
}
