import type { SupabaseClient } from "@supabase/supabase-js";

type FinalizeResult = {
  activationStatus: "active" | "scheduled";
  featuredStartsAt: string;
  featuredEndsAt: string;
};

export async function finalizeFeaturedOrderPayment(supabaseAdmin: SupabaseClient, orderId: string, razorpayPaymentId?: string | null): Promise<FinalizeResult> {
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: order, error: orderError } = await supabaseAdmin
    .from("property_featured_orders")
    .select("id, property_id, duration_days, payment_status, activation_status")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) throw new Error(orderError?.message || "Featured order not found");

  const currentActivation = String(order.activation_status ?? "").toLowerCase();
  if (String(order.payment_status).toLowerCase() === "paid" && ["active", "scheduled"].includes(currentActivation)) {
    return {
      activationStatus: currentActivation === "scheduled" ? "scheduled" : "active",
      featuredStartsAt: String((order as any).featured_starts_at ?? nowIso),
      featuredEndsAt: String((order as any).featured_ends_at ?? nowIso),
    };
  }

  const { data: existingActive } = await supabaseAdmin
    .from("property_featured_orders")
    .select("id, featured_ends_at")
    .eq("property_id", order.property_id)
    .eq("payment_status", "paid")
    .eq("activation_status", "active")
    .gt("featured_ends_at", nowIso)
    .neq("id", orderId)
    .order("featured_ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const durationDays = Math.max(1, Number(order.duration_days || 0));
  let activationStatus: "active" | "scheduled" = "active";
  let startAt = now;

  if (existingActive?.featured_ends_at) {
    console.info("[featured-finalize] existing active featured found", { orderId, propertyId: order.property_id, activeOrderId: existingActive.id, activeEndsAt: existingActive.featured_ends_at });
    activationStatus = "scheduled";
    startAt = new Date(existingActive.featured_ends_at);
    if (Number.isNaN(startAt.getTime()) || startAt.getTime() < now.getTime()) startAt = now;
    console.info("[featured-finalize] scheduling new paid featured order", { orderId, propertyId: order.property_id, startAt: startAt.toISOString() });
  } else {
    console.info("[featured-finalize] activating paid featured order immediately", { orderId, propertyId: order.property_id, startAt: nowIso });
  }

  const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const updateData: Record<string, unknown> = {
    payment_status: "paid",
    activation_status: activationStatus,
    paid_at: nowIso,
    featured_starts_at: startAt.toISOString(),
    featured_ends_at: endAt.toISOString(),
    updated_at: nowIso,
  };
  if (razorpayPaymentId) updateData.razorpay_payment_id = razorpayPaymentId;

  const { error: updateError } = await supabaseAdmin.from("property_featured_orders").update(updateData).eq("id", orderId);
  if (updateError) throw new Error(updateError.message);

  if (activationStatus === "active") {
    const { error: propertyError } = await supabaseAdmin
      .from("properties")
      .update({ is_featured: true, featured_started_at: startAt.toISOString(), featured_until: endAt.toISOString(), updated_at: nowIso })
      .eq("id", order.property_id);
    if (propertyError) throw new Error(propertyError.message);
  }

  return { activationStatus, featuredStartsAt: startAt.toISOString(), featuredEndsAt: endAt.toISOString() };
}
