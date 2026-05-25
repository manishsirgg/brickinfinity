import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRazorpayClient } from "@/lib/razorpay";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("id, role").eq("user_id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Admin access required.", code: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json()) as { razorpay_order_id?: string };
  if (!body.razorpay_order_id) return NextResponse.json({ error: "razorpay_order_id is required.", code: "RAZORPAY_ORDER_ID_REQUIRED" }, { status: 400 });

  const payments = await getRazorpayClient().orders.fetchPayments(body.razorpay_order_id);
  const captured = payments.items.find((p) => p.status === "captured" && p.order_id === body.razorpay_order_id);

  return NextResponse.json({ success: true, razorpay_order_id: body.razorpay_order_id, hasCapturedPayment: Boolean(captured), capturedPaymentId: captured?.id ?? null, paymentStatus: captured?.status ?? payments.items[0]?.status ?? null, amount: captured?.amount ?? null, currency: captured?.currency ?? null, capturedAt: captured?.created_at ? new Date(captured.created_at * 1000).toISOString() : null });
}
