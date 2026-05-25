import { createServiceClient } from "@/lib/supabase/service";

export const PAID_STATUSES = new Set(["paid", "success", "captured"]);
export const FAILED_STATUSES = new Set(["failed", "payment_failed"]);
export const PENDING_STATUSES = new Set(["pending", "created", "unpaid"]);

type FinanceStatus =
  | "revenue_success"
  | "pending_payment"
  | "real_failed_payment"
  | "cancelled_by_user"
  | "stale_cancelled"
  | "manual_review";

export type FeaturedOrder = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  paid_at?: string | null;
  owner_id?: string | null;
  property_id?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
  duration_days?: number | null;
  amount_paise: number;
  currency?: string | null;
  payment_status?: string | null;
  activation_status?: string | null;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  failure_reason?: string | null;
  metadata?: Record<string, unknown> | null;
  users?: { id?: string; full_name?: string | null; email?: string | null; phone?: string | null; whatsapp_number?: string | null } | null;
  properties?: { id?: string; title?: string | null; status?: string | null; is_featured?: boolean | null; featured_until?: string | null } | null;
};

export async function fetchFeaturedOrders() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("property_featured_orders")
    .select(`id,created_at,updated_at,paid_at,owner_id,property_id,plan_id,plan_name,duration_days,amount_paise,currency,payment_status,activation_status,razorpay_order_id,razorpay_payment_id,failure_reason,metadata,users:owner_id(id,full_name,email,phone,whatsapp_number),properties:property_id(id,title,status,is_featured,featured_until)`)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  return rows.map((row) => ({
    ...row,
    users: Array.isArray(row.users) ? row.users[0] ?? null : row.users ?? null,
    properties: Array.isArray(row.properties) ? row.properties[0] ?? null : row.properties ?? null,
  })) as FeaturedOrder[];
}

function toText(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function getFailureText(order: FeaturedOrder) {
  const metadata = order.metadata ?? {};
  return [order.failure_reason, metadata.error, metadata.message, metadata.failure_reason, metadata.cancel_reason].map(toText).join(" ");
}

export function isPaid(status?: string | null) { return PAID_STATUSES.has(String(status ?? "").toLowerCase()); }
export function isFailed(status?: string | null) { return FAILED_STATUSES.has(String(status ?? "").toLowerCase()); }
export function isPending(status?: string | null) { return PENDING_STATUSES.has(String(status ?? "").toLowerCase()); }

export function classifyFinanceStatus(order: FeaturedOrder): FinanceStatus {
  const paymentStatus = toText(order.payment_status);
  const activationStatus = toText(order.activation_status);
  const failureText = getFailureText(order);

  const hasStaleWording = ["stale unpaid razorpay order cancelled", "stale", "superseded", "already exists"].some((text) => failureText.includes(text));
  const hasUserCancelledWording = [
    "user cancelled",
    "cancelled by user",
    "dismissed",
    "checkout closed",
    "payment cancelled by user",
    "checkout_dismissed",
    "user cancelled razorpay checkout",
    "cancelled before payment",
  ].some((text) => failureText.includes(text));

  if (isPaid(paymentStatus)) {
    if (!["active", "scheduled"].includes(activationStatus)) return "manual_review";
    return "revenue_success";
  }

  if (isPending(paymentStatus)) return "pending_payment";

  if (paymentStatus === "cancelled") {
    if (hasStaleWording) return "stale_cancelled";
    if (hasUserCancelledWording) return "cancelled_by_user";
  }

  if (isFailed(paymentStatus) || failureText.includes("razorpay") || failureText.includes("verification failed")) {
    return "real_failed_payment";
  }

  return "pending_payment";
}
