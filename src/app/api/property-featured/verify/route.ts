import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type VerifyBody = {
  featuredOrderId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};

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

    const { data: order, error: orderError } = await supabase
      .from("property_featured_orders")
      .select("id, property_id, owner_id, razorpay_order_id, payment_status, activation_status")
      .eq("id", body.featuredOrderId)
      .maybeSingle();

    if (orderError || !order) {
      return NextResponse.json(
        { ok: false, error: "Featured order not found." },
        { status: 404 }
      );
    }

    if (order.owner_id !== appUser.id) {
      return NextResponse.json(
        { ok: false, error: "You cannot verify this featured order." },
        { status: 403 }
      );
    }

    if (order.razorpay_order_id !== body.razorpay_order_id) {
      return NextResponse.json(
        { ok: false, error: "Razorpay order mismatch." },
        { status: 400 }
      );
    }

    if (order.payment_status === "paid" && order.activation_status === "active") {
      const { data: propertyAfterActivation } = await supabase
        .from("properties")
        .select("id, featured_started_at, featured_until")
        .eq("id", order.property_id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        message: "Your property is now Featured.",
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
      await supabase
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

    const { error: activationError } = await supabase.rpc("activate_property_featured_order", {
      p_order_id: body.featuredOrderId,
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

    const { data: propertyAfterActivation } = await supabase
      .from("properties")
      .select("id, featured_started_at, featured_until")
      .eq("id", order.property_id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      message: "Your property is now Featured.",
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
