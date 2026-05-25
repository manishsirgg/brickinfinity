import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function errorResponse(message: string, code: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Authentication required.", "UNAUTHENTICATED", 401) };
  const { data: adminProfile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle();
  if (!adminProfile || !["admin", "super_admin"].includes(adminProfile.role)) return { error: errorResponse("Admin access required.", "FORBIDDEN", 403) };
  return { adminProfile };
}

export async function POST() {
  try {
    const adminAuth = await requireAdmin();
    if ("error" in adminAuth) return adminAuth.error;

    const supabaseAdmin = createServiceClient();
    const threshold = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: orders, error } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id")
      .in("payment_status", ["created", "pending"])
      .in("activation_status", ["created", "pending"])
      .is("razorpay_payment_id", null)
      .is("paid_at", null)
      .lt("created_at", threshold)
      .neq("payment_status", "cancelled")
      .limit(200);

    if (error) return errorResponse("Failed to fetch stale orders.", "STALE_FETCH_FAILED", 500);
    if (!orders?.length) return NextResponse.json({ success: true, status: "no_op", cancelled_count: 0 });

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("property_featured_orders")
      .update({
        payment_status: "cancelled",
        activation_status: "cancelled",
        cancelled_at: now,
        failure_reason: "Stale unpaid Razorpay order cancelled by admin.",
        admin_note: `bulk_cancelled_by_admin:${adminAuth.adminProfile.id};source:admin_cleanup_60m`,
        updated_at: now,
      })
      .in("id", orders.map((o) => o.id));

    if (updateError) return errorResponse("Failed to cancel stale orders.", "STALE_BULK_UPDATE_FAILED", 500);
    return NextResponse.json({ success: true, status: "cancelled", cancelled_count: orders.length, threshold_minutes: 60 });
  } catch (error) {
    console.error("[admin/property-featured/reconcile/cancel-stale-orders] failed", error);
    return errorResponse("Bulk cancel stale orders request failed.", "STALE_BULK_REQUEST_FAILED", 500);
  }
}

