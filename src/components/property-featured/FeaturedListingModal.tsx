"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

interface FeaturedPlan {
  id: string;
  plan_key: string;
  name: string;
  description: string | null;
  duration_days: number;
  amount_paise: number;
  compare_at_amount_paise: number | null;
  currency: string;
  badge: string | null;
  is_popular: boolean;
  is_best_value: boolean;
  benefits: string[] | null;
  sort_order: number;
}

interface CreateOrderResponse {
  ok: true;
  featuredOrderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: "INR";
  plan: {
    name: string;
    durationDays: number;
    badge: string | null;
  };
}

interface VerifyResponse {
  ok: true;
  message: string;
  activation: {
    propertyId: string;
    featuredOrderId: string;
    featuredStartsAt: string;
    featuredEndsAt: string;
  };
}

interface FeaturedListingModalProps {
  isOpen: boolean;
  propertyId: string | null;
  propertyTitle?: string;
  canPromote: boolean;
  onClose: () => void;
  onVerified: (activation: VerifyResponse["activation"]) => void;
}

type ApiErrorResponse = {
  ok?: false;
  error?: string;
  code?: string;
  details?: unknown;
};

function getApiErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value)) return null;
  const maybeError = (value as { error?: unknown }).error;
  return typeof maybeError === "string" && maybeError.trim().length > 0 ? maybeError : null;
}

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

function formatCurrency(amountPaise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amountPaise / 100);
}

async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;
  return await new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function FeaturedListingModal({ isOpen, propertyId, propertyTitle, canPromote, onClose, onVerified }: FeaturedListingModalProps) {
  const [plans, setPlans] = useState<FeaturedPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingPlanKey, setProcessingPlanKey] = useState<string | null>(null);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.sort_order - b.sort_order), [plans]);

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    async function fetchPlans() {
      setLoadingPlans(true);
      setError(null);
      try {
        const response = await fetch("/api/property-featured/plans");
        const result = await response.json();
        if (!response.ok || !result?.ok) throw new Error(result?.message || "Failed to load featured plans.");
        if (!ignore) setPlans(Array.isArray(result.plans) ? result.plans : []);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load featured plans.");
      } finally {
        if (!ignore) setLoadingPlans(false);
      }
    }
    fetchPlans();
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  async function handlePlanPurchase(plan: FeaturedPlan) {
    if (!propertyId || !canPromote) return;
    setProcessingPlanKey(plan.plan_key);
    setError(null);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) throw new Error("Unable to load payment gateway. Please try again.");

      const createOrderResponse = await fetch("/api/property-featured/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, planId: plan.id }),
      });
      const createOrderJson = (await createOrderResponse.json()) as CreateOrderResponse | ApiErrorResponse;
      if (!createOrderResponse.ok || !createOrderJson?.ok) {
        throw new Error(getApiErrorMessage(createOrderJson) || "Unable to create payment order.");
      }
      const createOrderData = createOrderJson as CreateOrderResponse;
      const checkoutKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!checkoutKey) throw new Error("Payment gateway key is missing. Please contact support.");

      const razorpay = new window.Razorpay({
        key: checkoutKey,
        amount: createOrderData.amount,
        currency: createOrderData.currency,
        name: "Brick Infinity",
        description: `${createOrderData.plan.name} - Featured Listing`,
        order_id: createOrderData.razorpayOrderId,
        theme: { color: "#0f172a" },
        notes: { featured_order_id: createOrderData.featuredOrderId },
        modal: {
          ondismiss: () => {
            setError("Payment was not completed.");
            setProcessingPlanKey(null);
          },
        },
        handler: async (paymentResponse: RazorpayHandlerResponse) => {
          try {
            const verifyResponse = await fetch("/api/property-featured/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                featuredOrderId: createOrderData.featuredOrderId,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            const verifyJson = (await verifyResponse.json()) as VerifyResponse | ApiErrorResponse;
            if (!verifyResponse.ok || !verifyJson?.ok) {
              throw new Error(getApiErrorMessage(verifyJson) || "Payment verification failed. If money was deducted, please contact support.");
            }
            const verifyData = verifyJson as VerifyResponse;
            onVerified(verifyData.activation);
            onClose();
          } catch (verifyErr) {
            setError(verifyErr instanceof Error ? verifyErr.message : "Payment verification failed. If money was deducted, please contact support.");
          } finally {
            setProcessingPlanKey(null);
          }
        },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during checkout.");
      setProcessingPlanKey(null);
    }
  }

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl md:text-2xl font-semibold">Choose Featured Listing Plan</h2><p className="text-sm text-muted mt-1">{propertyTitle || "Select a plan to boost this property's visibility."}</p></div><Button variant="secondary" onClick={onClose} disabled={Boolean(processingPlanKey)}>Close</Button></div>{!canPromote && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Only active or approved properties can be promoted.</p>}{error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}{loadingPlans && <p className="text-muted">Loading featured plans...</p>}{!loadingPlans && sortedPlans.length === 0 && !error && <p className="text-muted">No plans available right now.</p>}<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{sortedPlans.map((plan) => {const hasCompareAt = Boolean(plan.compare_at_amount_paise && plan.compare_at_amount_paise > plan.amount_paise);return <Card key={plan.id} className="p-5 space-y-3 border border-slate-200"><div className="flex flex-wrap gap-2">{plan.badge && <span className="badge-secondary">{plan.badge}</span>}{plan.is_popular && <span className="badge-success">Most Popular</span>}{plan.is_best_value && <span className="badge-warning">Best Value</span>}</div><h3 className="text-lg font-semibold">{plan.name}</h3><p className="text-sm text-muted">{plan.duration_days} days visibility</p><div><p className="text-2xl font-bold text-primary">{formatCurrency(plan.amount_paise)}</p>{hasCompareAt && <p className="text-sm text-muted line-through">{formatCurrency(plan.compare_at_amount_paise as number)}</p>}</div>{plan.description && <p className="text-sm text-muted">{plan.description}</p>}{Array.isArray(plan.benefits) && plan.benefits.length > 0 && <ul className="text-sm list-disc pl-5 space-y-1">{plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>}<Button className="w-full" disabled={!canPromote || Boolean(processingPlanKey)} onClick={() => handlePlanPurchase(plan)}>{processingPlanKey === plan.plan_key ? "Processing..." : "Select & Pay"}</Button></Card>;})}</div></div></div>;
}
