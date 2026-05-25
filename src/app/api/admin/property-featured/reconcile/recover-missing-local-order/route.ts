import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";
import { isFeaturePromotableStatus } from "@/lib/property-featured/status";

type RecoverBody = { razorpay_order_id?: string; razorpay_payment_id?: string; property_id?: string; plan_id?: string };
const errorResponse = (message: string, code: string, status: number, details?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...(details ? { details } : {}) }, { status });
async function requireAdmin() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) }; const { data: adminProfile, error } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle(); if (error || !adminProfile || !["admin", "super_admin"].includes(adminProfile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) }; return { adminProfile }; }

export async function POST(req: Request) {
  try {
    const adminAuth = await requireAdmin(); if ("error" in adminAuth) return adminAuth.error;
    const body = (await req.json()) as RecoverBody;
    if (!body.razorpay_order_id || !body.razorpay_payment_id || !body.property_id || !body.plan_id) return errorResponse("Missing required fields.", "INVALID_REQUEST", 400);
    const supabaseAdmin = createServiceClient();

    const { data: existingOrder } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id")
      .or(`razorpay_order_id.eq.${body.razorpay_order_id},razorpay_payment_id.eq.${body.razorpay_payment_id}`)
      .maybeSingle();
    if (existingOrder) return errorResponse("Local featured order already exists for this Razorpay order.", "DUPLICATE_RECOVERY_BLOCKED", 409, { existing_local_order_id: existingOrder.id });

    const payment = await getRazorpayClient().payments.fetch(body.razorpay_payment_id);
    const safePayment = { id: payment.id, order_id: payment.order_id, amount: Number(payment.amount), currency: payment.currency, status: payment.status, method: payment.method ?? null, email: payment.email ?? null, contact: payment.contact ?? null, created_at: payment.created_at ?? null };
    if (safePayment.status !== "captured") return errorResponse("Razorpay payment is not captured.", "PAYMENT_NOT_CAPTURED", 400, { payment_status: safePayment.status });
    if (safePayment.order_id !== body.razorpay_order_id) return errorResponse("Razorpay payment does not belong to provided order.", "RAZORPAY_ORDER_MISMATCH", 400, { payment_order_id: safePayment.order_id, provided_order_id: body.razorpay_order_id });

    const { data: property, error: propertyError } = await supabaseAdmin.from("properties").select("id, title, seller_id, status, deleted_at").eq("id", body.property_id).maybeSingle();
    if (propertyError || !property) return errorResponse("Property not found.", "PROPERTY_NOT_FOUND", 404);
    if (property.deleted_at !== null) return errorResponse("Deleted properties cannot be recovered.", "PROPERTY_DELETED", 400);
    if (!isFeaturePromotableStatus(property.status)) return errorResponse("Only active or approved properties are eligible.", "PROPERTY_STATUS_NOT_ELIGIBLE", 400, { property_status: property.status });
    if (!property.seller_id) return errorResponse("Property owner could not be resolved.", "PROPERTY_OWNER_MISSING", 400);

    const { data: plan, error: planError } = await supabaseAdmin
      .from("property_featured_plans")
      .select("id, plan_key, name, duration_days, amount_paise, compare_at_amount_paise, currency, is_active")
      .or(`id.eq.${body.plan_id},plan_key.eq.${body.plan_id}`)
      .maybeSingle();
    if (planError || !plan || !plan.is_active) return errorResponse("Featured plan not found or inactive.", "PLAN_NOT_FOUND_OR_INACTIVE", 404);

    const amountMatches = Number(plan.amount_paise) === Number(safePayment.amount);
    const currencyMatches = (plan.currency || "INR").toUpperCase() === (safePayment.currency || "INR").toUpperCase();
    console.info("[admin/property-featured/reconcile/recover-missing-local-order] validation", { adminProfileId: adminAuth.adminProfile.id, razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, selected_property_id: body.property_id, selected_plan_id: body.plan_id, amountMatches, currencyMatches });
    if (!amountMatches || !currencyMatches) return errorResponse("Payment amount/currency does not match selected plan.", "PLAN_PAYMENT_MISMATCH", 400, { amountMatches, currencyMatches, planAmountPaise: plan.amount_paise, paymentAmountPaise: safePayment.amount, planCurrency: plan.currency || "INR", paymentCurrency: safePayment.currency });

    const paidAt = safePayment.created_at ? new Date(safePayment.created_at * 1000).toISOString() : new Date().toISOString();
    const receipt = `recovered_${Date.now().toString(36)}_${safePayment.id.slice(-6)}`;

    const { data: insertedOrder, error: insertError } = await supabaseAdmin.from("property_featured_orders").insert({ property_id: property.id, owner_id: property.seller_id, plan_id: plan.id, plan_key: plan.plan_key, plan_name: plan.name, duration_days: plan.duration_days, amount_paise: plan.amount_paise, compare_at_amount_paise: plan.compare_at_amount_paise, currency: plan.currency || "INR", payment_status: "paid", status: "success", activation_status: "pending", razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, paid_at: paidAt, receipt, metadata: { recovery: true, recovery_source: "admin_razorpay_scanner", recovered_by_admin_id: adminAuth.adminProfile.id, razorpay_payment: safePayment } }).select("id").single();
    if (insertError || !insertedOrder) return errorResponse("Failed to create local featured order.", "LOCAL_ORDER_CREATE_FAILED", 500);

    const { error: activationError } = await supabaseAdmin.rpc("activate_property_featured_order", { p_order_id: insertedOrder.id, p_razorpay_payment_id: body.razorpay_payment_id, p_razorpay_signature: null });
    const { data: activatedProperty } = await supabaseAdmin.from("properties").select("id, title, featured_started_at, featured_until").eq("id", property.id).maybeSingle();

    console.info("[admin/property-featured/reconcile/recover-missing-local-order] result", { adminProfileId: adminAuth.adminProfile.id, razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, selected_property_id: body.property_id, selected_plan_id: body.plan_id, localOrderCreatedId: insertedOrder.id, activationResult: activationError ? "failed" : "success" });
    if (activationError) return errorResponse("Local order recovered but activation failed.", "ACTIVATION_FAILED", 500, { local_order_id: insertedOrder.id });

    return NextResponse.json({ success: true, message: "Recovered and activated featured order.", data: { local_order_id: insertedOrder.id, property_id: property.id, property_title: property.title, plan_id: plan.id, plan_name: plan.name, amount_paise: plan.amount_paise, currency: plan.currency || "INR", razorpay_order_id: body.razorpay_order_id, razorpay_payment_id: body.razorpay_payment_id, activation_status: "active", featured_starts_at: activatedProperty?.featured_started_at ?? null, featured_ends_at: activatedProperty?.featured_until ?? null } });
  } catch (error) {
    console.error("[admin/property-featured/reconcile/recover-missing-local-order] failed", error);
    return errorResponse("Failed to recover missing local order.", "RECOVERY_FAILED", 500);
  }
}
