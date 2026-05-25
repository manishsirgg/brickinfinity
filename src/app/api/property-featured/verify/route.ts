import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type VerifyBody = {
  featuredOrderId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  propertyId?: string;
  planId?: string;
};

type ActivationStatus = "active" | "scheduled";

function buildActivationResponse(status: ActivationStatus) {
  return {
    status,
    activationStatus: status,
    message:
      status === "scheduled"
        ? "Payment successful. Your Featured listing has been scheduled after your current active period."
        : "Payment successful. Your listing is now Featured.",
  };
}

function safeSignatureMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Please login to verify payment." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as VerifyBody;
    console.info("[property-featured/verify] payload summary", {
      keys: Object.keys(body ?? {}),
      razorpay_order_id: body?.razorpay_order_id ?? null,
      razorpay_payment_id: body?.razorpay_payment_id ?? null,
      has_signature: Boolean(body?.razorpay_signature),
    });

    if (
      !body.featuredOrderId ||
      !body.razorpay_order_id ||
      !body.razorpay_payment_id ||
      !body.razorpay_signature
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing payment verification details." },
        { status: 400 }
      );
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (appUserError || !appUser) {
      return NextResponse.json(
        { ok: false, error: "User profile not found." },
        { status: 404 }
      );
    }

    const lookupColumn = "razorpay_order_id";
    const { data: order, error: orderError } = await supabaseAdmin
      .from("property_featured_orders")
      .select("id, property_id, owner_id, razorpay_order_id, payment_status, activation_status")
      .eq(lookupColumn, body.razorpay_order_id)
      .maybeSingle();

    console.info("[property-featured/verify] local order lookup result", {
      lookupColumn,
      found: Boolean(order),
      lookupError: orderError?.message ?? null,
      orderId: order?.id ?? null,
      paymentStatus: order?.payment_status ?? null,
      activationStatus: order?.activation_status ?? null,
    });

    if (orderError || !order) {
      return NextResponse.json(
        {
          ok: false,
          error: "Featured order not found.",
          code: "FEATURED_ORDER_NOT_FOUND",
          details: {
            razorpay_order_id: body.razorpay_order_id,
            lookupColumn,
          },
        },
        { status: 404 }
      );
    }

    if (order.owner_id !== appUser.id) {
      return NextResponse.json(
        { ok: false, error: "You cannot verify this featured order." },
        { status: 403 }
      );
    }

    if (body.featuredOrderId && order.id !== body.featuredOrderId) {
      return NextResponse.json(
        { ok: false, error: "Featured order mismatch." },
        { status: 400 }
      );
    }

    if (order.razorpay_order_id !== body.razorpay_order_id) {
      return NextResponse.json(
        { ok: false, error: "Razorpay order mismatch." },
        { status: 400 }
      );
    }

    if (
      order.payment_status === "paid" &&
      (order.activation_status === "active" || order.activation_status === "scheduled")
    ) {
      const idempotentStatus = order.activation_status as ActivationStatus;
      console.info("[property-featured/verify] idempotent success", {
        orderId: order.id,
        activationStatus: idempotentStatus,
      });
      const { data: propertyAfterActivation } = await supabaseAdmin
        .from("properties")
        .select("id, featured_started_at, featured_until")
        .eq("id", order.property_id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        ...buildActivationResponse(idempotentStatus),
        activation: {
          propertyId: order.property_id,
          featuredOrderId: order.id,
          featuredStartsAt: propertyAfterActivation?.featured_started_at ?? null,
          featuredEndsAt: propertyAfterActivation?.featured_until ?? null,
        },
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new Error("Missing RAZORPAY_KEY_SECRET");
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
      .digest("hex");

    if (!safeSignatureMatch(expectedSignature, body.razorpay_signature)) {
      await supabaseAdmin
        .from("property_featured_orders")
        .update({
          payment_status: "failed",
          activation_status: "failed",
          failure_reason: "Invalid Razorpay signature",
          failed_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      return NextResponse.json(
        { ok: false, error: "Invalid payment signature." },
        { status: 400 }
      );
    }

    const { error: activationError } = await supabaseAdmin.rpc("activate_property_featured_order", {
      p_order_id: order.id,
      p_razorpay_payment_id: body.razorpay_payment_id,
      p_razorpay_signature: body.razorpay_signature,
    });

    if (activationError) {
      console.error("[property-featured/verify]", activationError);
      return NextResponse.json(
        {
          ok: false,
          error: "Payment verified, but featured activation failed. Please contact support.",
        },
        { status: 500 }
      );
    }

    console.info("[property-featured/verify] activation rpc success", {
      orderId: order.id,
      paymentStatusBefore: order.payment_status,
      activationStatusBefore: order.activation_status,
    });

    const { data: updatedOrder } = await supabaseAdmin
      .from("property_featured_orders")
      .select("activation_status")
      .eq("id", order.id)
      .maybeSingle();

    const activationStatus: ActivationStatus =
      updatedOrder?.activation_status === "scheduled" ? "scheduled" : "active";

    const { data: propertyAfterActivation } = await supabaseAdmin
      .from("properties")
      .select("id, featured_started_at, featured_until")
      .eq("id", order.property_id)
      .maybeSingle();

    console.info("[property-featured/verify] activation result", {
      orderId: order.id,
      propertyId: order.property_id,
      activationStatus,
      featuredStartsAt: propertyAfterActivation?.featured_started_at ?? null,
      featuredEndsAt: propertyAfterActivation?.featured_until ?? null,
    });

    return NextResponse.json({
      ok: true,
      ...buildActivationResponse(activationStatus),
      activation: {
        propertyId: order.property_id,
        featuredOrderId: order.id,
        featuredStartsAt: propertyAfterActivation?.featured_started_at ?? null,
        featuredEndsAt: propertyAfterActivation?.featured_until ?? null,
      },
    });
  } catch (error) {
    console.error("[property-featured/verify]", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Payment verified, but featured activation failed. Please contact support.",
      },
      { status: 500 }
    );
  }
}
