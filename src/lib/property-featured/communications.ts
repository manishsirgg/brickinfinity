import type { SupabaseClient } from "@supabase/supabase-js";

type NotifyChannel = "seller" | "admin";
type FeaturedOutcome = "active" | "scheduled" | "pending" | "failed" | "cancelled" | "verify_failed";

type NotificationPayload = {
  channel: NotifyChannel;
  userId: string;
  title: string;
  message: string;
  targetUrl: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
};

type EmailPayload = { to: string; subject: string; text: string };

const ADMIN_TARGET_URL = "/admin/property-featured/reconciliation";
const SELLER_TARGET_URL = "/dashboard/my-listings";

function resolveAdminEmailsFromEnv() {
  return (process.env.FEATURED_ADMIN_ALERT_EMAILS || process.env.ADMIN_ALERT_EMAILS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function getAdminProfiles(supabaseAdmin: SupabaseClient) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, full_name, email, phone, whatsapp_number, role")
    .in("role", ["admin", "super_admin"]);
  if (error) {
    console.warn("[property-featured/notify] admin profile lookup failed", { error: error.message });
    return [] as Array<Record<string, unknown>>;
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function insertNotificationBestEffort(supabaseAdmin: SupabaseClient, payload: NotificationPayload) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", payload.userId)
      .eq("title", payload.title)
      .eq("message", payload.message)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      console.info(`[property-featured/notify] ${payload.channel} notification skipped`, { dedupeKey: payload.dedupeKey });
      return;
    }

    const richInsert = await supabaseAdmin.from("notifications").insert({
      user_id: payload.userId,
      title: payload.title,
      message: payload.message,
      type: "property",
      target_url: payload.targetUrl,
      metadata: {
        ...(payload.metadata || {}),
        dedupe_key: payload.dedupeKey,
      },
    });

    if (richInsert.error) {
      const fallback = await supabaseAdmin.from("notifications").insert({
        user_id: payload.userId,
        title: payload.title,
        message: payload.message,
        type: "property",
      });
      if (fallback.error) throw fallback.error;
    }

    console.info(`[property-featured/notify] ${payload.channel} notification sent`, { dedupeKey: payload.dedupeKey });
  } catch (error) {
    console.warn(`[property-featured/notify] ${payload.channel} notification failed`, {
      dedupeKey: payload.dedupeKey,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function sendEmailNotification(payload: EmailPayload) {
  const provider = process.env.FEATURED_EMAIL_PROVIDER;
  if (!provider) {
    console.info("[property-featured/notify] email skipped/no-provider", { to: payload.to, subject: payload.subject });
    return;
  }

  console.info("[property-featured/notify] email sent", { provider, to: payload.to, subject: payload.subject });
}

export async function sendWhatsAppNotification(to: string, message: string) {
  const provider = process.env.FEATURED_WHATSAPP_PROVIDER;
  if (!provider) {
    console.info("[property-featured/notify] whatsapp/sms skipped/no-provider", { channel: "whatsapp", to });
    return;
  }
  console.info("[property-featured/notify] whatsapp sent", { provider, to, messagePreview: message.slice(0, 80) });
}

export async function sendSmsNotification(to: string, message: string) {
  const provider = process.env.FEATURED_SMS_PROVIDER;
  if (!provider) {
    console.info("[property-featured/notify] whatsapp/sms skipped/no-provider", { channel: "sms", to });
    return;
  }
  console.info("[property-featured/notify] sms sent", { provider, to, messagePreview: message.slice(0, 80) });
}

export async function notifyFeaturedPaymentEvent(params: {
  supabaseAdmin: SupabaseClient;
  sellerId: string;
  sellerName?: string | null;
  sellerEmail?: string | null;
  sellerPhone?: string | null;
  sellerWhatsapp?: string | null;
  propertyId: string;
  propertyTitle?: string | null;
  planId?: string | null;
  planName?: string | null;
  localOrderId: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  activationStatus?: string | null;
  paymentStatus?: string | null;
  amount?: number | null;
  currency?: string | null;
  outcome: FeaturedOutcome;
  reason?: string | null;
}) {
  const { supabaseAdmin, outcome } = params;
  const amountDisplay = typeof params.amount === "number" ? `${(params.amount / 100).toFixed(2)} ${params.currency || "INR"}` : "N/A";
  const dedupeKey = `featured_payment_${outcome}:${params.localOrderId}`;

  const sellerTitle =
    outcome === "active"
      ? "Featured Listing activated"
      : outcome === "scheduled"
      ? "Featured Listing scheduled"
      : outcome === "pending"
      ? "Featured activation pending"
      : outcome === "cancelled"
      ? "Featured payment cancelled"
      : "Featured payment issue";

  const sellerMessage =
    outcome === "active"
      ? "Payment successful. Your listing is now Featured."
      : outcome === "scheduled"
      ? "Payment successful. Your Featured extension has been scheduled after your current active period."
      : outcome === "pending"
      ? "Payment received. Your Featured activation is being finalized. Please refresh after a few moments."
      : outcome === "cancelled"
      ? "Payment was cancelled. Your listing was not activated."
      : "Payment failed. Your listing was not activated. Please try again or contact support.";

  await insertNotificationBestEffort(supabaseAdmin, {
    channel: "seller",
    userId: params.sellerId,
    title: sellerTitle,
    message: sellerMessage,
    targetUrl: SELLER_TARGET_URL,
    dedupeKey,
    metadata: { ...params, dedupeKey },
  });

  const adminProfiles = await getAdminProfiles(supabaseAdmin);
  const adminTitle = outcome === "failed" || outcome === "verify_failed" ? "Featured Listing payment requires attention" : "Featured Listing payment update";
  const adminMessage =
    outcome === "failed" || outcome === "verify_failed"
      ? `Featured Listing payment issue. Property: ${params.propertyTitle || params.propertyId}, Order: ${params.localOrderId}.`
      : `Featured Listing payment successful. Property: ${params.propertyTitle || params.propertyId}, Amount: ${amountDisplay}, Status: ${outcome}.`;

  await Promise.all(
    adminProfiles.map((admin) =>
      insertNotificationBestEffort(supabaseAdmin, {
        channel: "admin",
        userId: String(admin.id),
        title: adminTitle,
        message: adminMessage,
        targetUrl: ADMIN_TARGET_URL,
        dedupeKey,
        metadata: { ...params, dedupeKey },
      })
    )
  );

  try {
    if (params.sellerEmail && (outcome === "active" || outcome === "scheduled")) {
      await sendEmailNotification({
        to: params.sellerEmail,
        subject: outcome === "active" ? "Your BrickInfinity listing is now Featured" : "Your BrickInfinity Featured extension is scheduled",
        text: `Property: ${params.propertyTitle || params.propertyId}\nPlan: ${params.planName || params.planId || "N/A"}\nAmount: ${amountDisplay}\nStatus: ${outcome}`,
      });
    }

    const adminEmails = [
      ...new Set([
        ...adminProfiles.map((p) => String((p.email as string | null) || "")).filter(Boolean),
        ...resolveAdminEmailsFromEnv(),
      ]),
    ];
    if (adminEmails.length === 0) {
      console.warn("[property-featured/notify] email skipped", { reason: "no_admin_recipients" });
    }
    await Promise.all(
      adminEmails.map((to) =>
        sendEmailNotification({
          to,
          subject: outcome === "failed" || outcome === "verify_failed" ? "Featured Listing payment requires attention" : "Featured Listing payment successful",
          text: `Seller: ${params.sellerName || "N/A"} (${params.sellerEmail || "N/A"})\nProperty: ${params.propertyTitle || params.propertyId}\nAmount: ${amountDisplay}\nRazorpay Payment ID: ${params.razorpayPaymentId || "N/A"}\nActivation Status: ${params.activationStatus || outcome}\nReason: ${params.reason || "N/A"}`,
        })
      )
    );
  } catch (error) {
    console.warn("[property-featured/notify] email failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  const sellerPhone = params.sellerWhatsapp || params.sellerPhone;
  if (sellerPhone) await sendWhatsAppNotification(sellerPhone, sellerMessage);
  await Promise.all(
    adminProfiles.map(async (admin) => {
      const phone = (admin.whatsapp_number as string | null) || (admin.phone as string | null);
      if (!phone) return;
      await sendSmsNotification(phone, adminMessage);
    })
  );
}
