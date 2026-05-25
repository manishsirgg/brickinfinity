import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getRazorpayClient } from "@/lib/razorpay";
import { isFeaturePromotableStatus } from "@/lib/property-featured/status";

type CreateOrderBody = {
  propertyId?: string;
  planId?: string;
};

function errorResponse(message: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createServiceClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse("Please login to promote your property.", "UNAUTHENTICATED", 401);
    }

    const body = (await req.json()) as CreateOrderBody;
    console.info("[property-featured/create-order] payload received", {
      propertyId: body?.propertyId,
      planId: body?.planId,
      authUserId: user.id,
    });

    if (!body.propertyId) {
      return errorResponse("Property ID is required.", "PROPERTY_ID_REQUIRED", 400);
    }

    if (!body.planId) {
      return errorResponse("Featured plan is required.", "PLAN_ID_REQUIRED", 400);
    }

    const { data: appUser, error: appUserError } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    console.info("[property-featured/create-order] authenticated profile lookup", {
      authUserId: user.id,
      profileId: appUser?.id ?? null,
      profileLookupError: appUserError?.message ?? null,
    });

    if (appUserError || !appUser) {
      return errorResponse("User profile not found.", "PROFILE_NOT_FOUND", 404);
    }

    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id, seller_id, status, deleted_at")
      .eq("id", body.propertyId)
      .maybeSingle();

    console.info("[property-featured/create-order] property lookup result", {
      propertyId: body.propertyId,
      found: Boolean(property),
      lookupError: propertyError?.message ?? null,
      propertyStatus: property?.status ?? null,
      propertyOwnerId: property?.seller_id ?? null,
      deletedAt: property?.deleted_at ?? null,
    });

    if (propertyError || !property) {
      return errorResponse("Property not found.", "PROPERTY_NOT_FOUND", 404);
    }

    if (property.seller_id !== appUser.id) {
      return errorResponse("You can promote only your own property.", "PROPERTY_NOT_OWNED", 403);
    }

    if (property.deleted_at !== null) {
      return errorResponse("Deleted properties cannot be promoted.", "PROPERTY_DELETED", 400);
    }

    if (!isFeaturePromotableStatus(property.status)) {
      return errorResponse("Only active or approved properties can be promoted as Featured.", "PROPERTY_STATUS_NOT_ELIGIBLE", 400, {
        status: property.status,
      });
    }

    const { data: plan, error: planError } = await supabase
      .from("property_featured_plans")
      .select("id, plan_key, name, duration_days, amount_paise, compare_at_amount_paise, currency, badge, is_active")
      .eq("id", body.planId)
      .maybeSingle();

    console.info("[property-featured/create-order] selected plan lookup", {
      planId: body.planId,
      found: Boolean(plan),
      planLookupError: planError?.message ?? null,
      isActive: plan?.is_active ?? null,
      planKey: plan?.plan_key ?? null,
      amountPaise: plan?.amount_paise ?? null,
    });

    if (planError || !plan || !plan.is_active) {
      return errorResponse("Featured plan not found or inactive.", "PLAN_NOT_FOUND_OR_INACTIVE", 404);
    }

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    console.info("[property-featured/create-order] razorpay env check", {
      hasKeyId: Boolean(razorpayKeyId),
      hasKeySecret: Boolean(razorpayKeySecret),
    });
    if (!razorpayKeyId || !razorpayKeySecret) {
      return errorResponse("Razorpay is not configured on the server.", "RAZORPAY_NOT_CONFIGURED", 500);
    }

    const receipt = `pf_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    if (receipt.length > 40) {
      throw new Error("Generated Razorpay receipt exceeds 40 characters");
    }

    let razorpayOrder;
    try {
      razorpayOrder = await getRazorpayClient().orders.create({
        amount: plan.amount_paise,
        currency: "INR",
        receipt,
        notes: {
          purpose: "property_featured_listing",
          property_id: property.id,
          owner_id: appUser.id,
          plan_key: plan.plan_key,
        },
      });
      console.info("[property-featured/create-order] razorpay order created", {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        status: razorpayOrder.status,
      });
    } catch (razorpayError) {
      const typedError = razorpayError as {
        statusCode?: number;
        error?: {
          code?: string;
          description?: string;
          reason?: string;
          step?: string;
        };
      };

      console.error("[property-featured/create-order] razorpay order creation failed", {
        statusCode: typedError?.statusCode ?? null,
        razorpayCode: typedError?.error?.code ?? null,
        description: typedError?.error?.description ?? null,
        reason: typedError?.error?.reason ?? null,
        step: typedError?.error?.step ?? null,
        receiptLength: receipt.length,
        receipt,
      });

      return errorResponse("Unable to create payment order.", "RAZORPAY_ORDER_CREATE_FAILED", 502, {
        statusCode: typedError?.statusCode ?? null,
        razorpayCode: typedError?.error?.code ?? null,
        description: typedError?.error?.description ?? null,
        reason: typedError?.error?.reason ?? null,
        step: typedError?.error?.step ?? null,
      });
    }

    const { data: insertedOrder, error: orderInsertError } = await supabaseAdmin
      .from("property_featured_orders")
      .insert({
        property_id: property.id,
        owner_id: appUser.id,
        plan_id: plan.id,
        plan_key: plan.plan_key,
        plan_name: plan.name,
        duration_days: plan.duration_days,
        amount_paise: plan.amount_paise,
        compare_at_amount_paise: plan.compare_at_amount_paise,
        currency: plan.currency || "INR",
        payment_status: "created",
        activation_status: "pending",
        razorpay_order_id: razorpayOrder.id,
        receipt,
        metadata: {
          razorpay_order: razorpayOrder,
          created_from: "seller_dashboard",
        },
      })
      .select("id")
      .single();

    if (orderInsertError || !insertedOrder) {
      console.error("[property-featured/create-order] featured order insert failed", {
        code: orderInsertError?.code ?? null,
        message: orderInsertError?.message ?? "Unable to create featured listing order row",
        details: orderInsertError?.details ?? null,
        hint: orderInsertError?.hint ?? null,
        propertyId: property.id,
        ownerId: appUser.id,
        planId: plan.id,
        razorpayOrderId: razorpayOrder.id,
      });

      return errorResponse(
        "Unable to save featured listing payment order.",
        "FEATURED_ORDER_INSERT_FAILED",
        500,
        {
          razorpayOrderId: razorpayOrder.id,
          propertyId: property.id,
          planId: plan.id,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        featuredOrderId: insertedOrder.id,
        razorpayOrderId: razorpayOrder.id,
        amount: plan.amount_paise,
        currency: "INR",
        plan: {
          name: plan.name,
          durationDays: plan.duration_days,
          badge: plan.badge,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[property-featured/create-order]", error);
    return errorResponse("Unable to create featured listing order.", "CREATE_ORDER_FAILED", 500);
  }
}
