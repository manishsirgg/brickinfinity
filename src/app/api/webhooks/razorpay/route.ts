import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { finalizeFeaturedOrderPayment } from "@/lib/property-featured/finalize";

type JsonObject = Record<string, unknown>;
type SupportedWebhookEvent = "order.paid" | "payment.captured" | "payment.failed";

type FeaturedOrderRow = {
  id: string;
  property_id: string;
  owner_id: string;
  payment_status: string | null;
  activation_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  featured_ends_at: string | null;
};

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" ? (value as JsonObject) : null;
}

function getPathString(source: unknown, path: string[]): string | null {
  let current: unknown = source;
  for (const segment of path) {
    const obj = asObject(current);
    if (!obj || !(segment in obj)) {
      return null;
    }
    current = obj[segment];
  }
  return typeof current === "string" && current.trim().length > 0 ? current : null;
}

function safeSignatureMatch(expectedHex: string, providedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const provided = Buffer.from(providedHex, "hex");

  if (expected.length === 0 || provided.length === 0 || expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

function extractWebhookDetails(eventObj: JsonObject): {
  eventType: string;
  orderId: string | null;
  paymentId: string | null;
  failureReason: string | null;
} {
  const eventType = getPathString(eventObj, ["event"]) ?? "";

  if (eventType === "order.paid") {
    return {
      eventType,
      orderId: getPathString(eventObj, ["payload", "order", "entity", "id"]),
      paymentId: getPathString(eventObj, ["payload", "payment", "entity", "id"]),
      failureReason: null,
    };
  }

  if (eventType === "payment.captured") {
    return {
      eventType,
      orderId: getPathString(eventObj, ["payload", "payment", "entity", "order_id"]),
      paymentId: getPathString(eventObj, ["payload", "payment", "entity", "id"]),
      failureReason: null,
    };
  }

  if (eventType === "payment.failed") {
    return {
      eventType,
      orderId: getPathString(eventObj, ["payload", "payment", "entity", "order_id"]),
      paymentId: getPathString(eventObj, ["payload", "payment", "entity", "id"]),
      failureReason:
        getPathString(eventObj, ["payload", "payment", "entity", "error_description"]) ??
        getPathString(eventObj, ["payload", "payment", "entity", "error_reason"]),
    };
  }

  return {
    eventType,
    orderId: null,
    paymentId: null,
    failureReason: null,
  };
}

function isAlreadyActive(order: FeaturedOrderRow): boolean {
  return order.payment_status === "paid" && order.activation_status === "active";
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[razorpay-webhook] Missing RAZORPAY_WEBHOOK_SECRET");
    return NextResponse.json({ ok: false, error: "Webhook configuration missing." }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 400 });
  }

  let expectedSignature: string;
  try {
    expectedSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  } catch (error) {
    console.error("[razorpay-webhook]", error);
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 400 });
  }

  if (!safeSignatureMatch(expectedSignature, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid webhook payload." }, { status: 400 });
  }

  const eventObj = asObject(parsed);
  if (!eventObj) {
    return NextResponse.json({ ok: false, error: "Invalid webhook payload." }, { status: 400 });
  }

  const { eventType, orderId, paymentId, failureReason } = extractWebhookDetails(eventObj);
  const supportedEvents: SupportedWebhookEvent[] = ["order.paid", "payment.captured", "payment.failed"];

  if (!supportedEvents.includes(eventType as SupportedWebhookEvent)) {
    return NextResponse.json({ ok: true, ignored: true }, { status: 200 });
  }

  if (!orderId) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "No Razorpay order id found." },
      { status: 200 }
    );
  }

  const supabase = createServiceClient();

  const { data: featuredOrder, error: featuredOrderError } = await supabase
    .from("property_featured_orders")
    .select(
      "id, property_id, owner_id, payment_status, activation_status, razorpay_order_id, razorpay_payment_id, featured_ends_at"
    )
    .eq("razorpay_order_id", orderId)
    .maybeSingle<FeaturedOrderRow>();

  if (featuredOrderError) {
    console.error("[razorpay-webhook]", {
      message: featuredOrderError.message,
      eventType,
      razorpayOrderId: orderId,
    });
    return NextResponse.json({ ok: false, error: "Featured reconciliation failed." }, { status: 500 });
  }

  if (!featuredOrder) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "No matching featured order." },
      { status: 200 }
    );
  }

  if (eventType === "order.paid" || eventType === "payment.captured") {
    if (isAlreadyActive(featuredOrder)) {
      return NextResponse.json({ ok: true, alreadyProcessed: true }, { status: 200 });
    }

    try {
      await finalizeFeaturedOrderPayment(supabase, featuredOrder.id, paymentId);
    } catch (activationError) {
      console.error("[razorpay-webhook] Featured activation failed", {
        message: activationError instanceof Error ? activationError.message : "unknown",
        eventType,
        razorpayOrderId: orderId,
        featuredOrderId: featuredOrder.id,
      });
      return NextResponse.json({ ok: false, error: "Featured activation failed." }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, processed: true, event: eventType, featuredOrderId: featuredOrder.id },
      { status: 200 }
    );
  }

  if (isAlreadyActive(featuredOrder)) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: "Featured order already active." },
      { status: 200 }
    );
  }

  const now = new Date().toISOString();
  const { error: failedUpdateError } = await supabase
    .from("property_featured_orders")
    .update({
      payment_status: "failed",
      activation_status: "failed",
      razorpay_payment_id: paymentId ?? featuredOrder.razorpay_payment_id,
      failure_reason: failureReason ?? "Razorpay payment failed",
      failed_at: now,
      updated_at: now,
    })
    .eq("id", featuredOrder.id);

  if (failedUpdateError) {
    console.error("[razorpay-webhook]", {
      message: failedUpdateError.message,
      eventType,
      razorpayOrderId: orderId,
      featuredOrderId: featuredOrder.id,
    });
    return NextResponse.json({ ok: false, error: "Featured reconciliation failed." }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, processed: true, event: "payment.failed", featuredOrderId: featuredOrder.id },
    { status: 200 }
  );
}
