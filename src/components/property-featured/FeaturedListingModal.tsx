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
  status?: "active" | "scheduled";
  activationStatus?: "active" | "scheduled";
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
  isFeaturedActive?: boolean;
  activeFeaturedPlanKey?: string | null;
  hasScheduledExtension?: boolean;
  canPromote: boolean;
  onClose: () => void;
  onVerified: (activation: VerifyResponse["activation"]) => void;
}

type ApiErrorResponse = {
  ok?: false;
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
};

function getApiErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const maybeError = (value as { error?: unknown; message?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim().length > 0) return maybeError;
  const maybeMessage = (value as { error?: unknown; message?: unknown }).message;
  return typeof maybeMessage === "string" && maybeMessage.trim().length > 0 ? maybeMessage : null;
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
      on: (event: string, callback: (response: unknown) => void) => void;
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

export default function FeaturedListingModal({
  isOpen,
  propertyId,
  propertyTitle,
  isFeaturedActive = false,
  activeFeaturedPlanKey = null,
  hasScheduledExtension = false,
  canPromote,
  onClose,
  onVerified,
}: FeaturedListingModalProps) {
  const [plans, setPlans] = useState<FeaturedPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingPlanKey, setProcessingPlanKey] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.sort_order - b.sort_order), [plans]);
  const activePlan = useMemo(() => {
    if (!isFeaturedActive || !activeFeaturedPlanKey) return null;
    return sortedPlans.find((plan) => plan.plan_key === activeFeaturedPlanKey) ?? null;
  }, [isFeaturedActive, activeFeaturedPlanKey, sortedPlans]);

  function getPlanDisabledReason(plan: FeaturedPlan): "current" | "lower" | null {
    if (!isFeaturedActive || !activePlan) return null;
    if (plan.id === activePlan.id || plan.plan_key === activePlan.plan_key) return "current";
    if (plan.sort_order <= activePlan.sort_order) return "lower";
    if (plan.amount_paise <= activePlan.amount_paise) return "lower";
    return null;
  }

  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    async function fetchPlans() {
      setLoadingPlans(true);
      setError(null);
      setSuccessMessage(null);
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
    if (getPlanDisabledReason(plan)) return;
    if (processingPlanKey || isCheckoutOpen || isVerifying) return;
    setProcessingPlanKey(plan.plan_key);
    setError(null);
    setSuccessMessage(null);
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
      if (!checkoutKey) {
        setError("Razorpay checkout key is not configured.");
        setIsCheckoutOpen(false);
        setIsVerifying(false);
        setProcessingPlanKey(null);
        return;
      }

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
            setError("Payment was cancelled. Your listing was not activated.");
            void (async () => {
              try {
                await fetch("/api/property-featured/payment-cancelled", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    featuredOrderId: createOrderData.featuredOrderId,
                    razorpayOrderId: createOrderData.razorpayOrderId,
                    reason: "checkout_dismissed",
                  }),
                });
              } catch {
                // best effort only - do not block or crash UI
              }
            })();
            setIsCheckoutOpen(false);
            setProcessingPlanKey(null);
          },
        },
        handler: async (paymentResponse: RazorpayHandlerResponse) => {
          setIsVerifying(true);
          try {
            const verifyResponse = await fetch("/api/property-featured/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                featuredOrderId: createOrderData.featuredOrderId,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
                propertyId,
                planId: plan.id,
              }),
            });
            const verifyJson = (await verifyResponse.json()) as VerifyResponse | ApiErrorResponse;
            if (!verifyResponse.ok || !verifyJson?.ok) throw new Error(getApiErrorMessage(verifyJson) || "Payment verification failed.");
            const verifyData = verifyJson as VerifyResponse;
            const status = verifyData.activationStatus ?? verifyData.status;
            if (status === "scheduled") setSuccessMessage("Payment successful. Your Featured extension has been scheduled after your current active period.");
            else if (status === "active") setSuccessMessage("Payment successful. Your listing is now Featured.");
            else setSuccessMessage("Payment received. Your Featured activation is being finalized. Please refresh after a few moments.");
            onVerified(verifyData.activation);
          } catch (verifyErr) {
            setError(verifyErr instanceof Error ? verifyErr.message : "Payment verification failed.");
          } finally {
            setIsVerifying(false);
            setIsCheckoutOpen(false);
            setProcessingPlanKey(null);
          }
        },
      });
      razorpay.on("payment.failed", () => {
        setError("Payment failed. No amount has been activated for Featured Listing. Please try again.");
        setIsCheckoutOpen(false);
        setProcessingPlanKey(null);
      });
      setIsCheckoutOpen(true);
      razorpay.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during checkout.");
      setProcessingPlanKey(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">Choose Featured Listing Plan</h2>
            <p className="text-sm text-muted mt-1">{propertyTitle || "Select a plan to boost this property's visibility."}</p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={Boolean(processingPlanKey)}>Close</Button>
        </div>

        {!canPromote && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Only active or approved properties can be promoted.</p>}
        {isFeaturedActive && activePlan && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Your listing is already Featured. Lower or same-tier plans are disabled. You can choose a higher plan to upgrade your visibility.</p>}
        {hasScheduledExtension && <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">Your listing already has a scheduled Featured extension. Please review your active plan before purchasing another upgrade.</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        {successMessage && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{successMessage}</p>}
        {loadingPlans && <p className="text-muted">Loading featured plans...</p>}
        {!loadingPlans && sortedPlans.length === 0 && !error && <p className="text-muted">No plans available right now.</p>}

        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedPlans.map((plan) => {
            const hasCompareAt = Boolean(plan.compare_at_amount_paise && plan.compare_at_amount_paise > plan.amount_paise);
            const disabledReason = getPlanDisabledReason(plan);
            const isPlanDisabled = Boolean(disabledReason);

            return (
              <Card key={plan.id} className={`p-5 space-y-3 border border-slate-200 ${isPlanDisabled ? "opacity-70" : ""}`}>
                <div className="flex flex-wrap gap-2">
                  {plan.badge && <span className="badge-secondary">{plan.badge}</span>}
                  {plan.is_popular && <span className="badge-success">Most Popular</span>}
                  {plan.is_best_value && <span className="badge-warning">Best Value</span>}
                  {isFeaturedActive && activePlan && !isPlanDisabled && <span className="badge-secondary">Upgrade Available</span>}
                </div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-sm text-muted">{plan.duration_days} days visibility</p>
                <div>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(plan.amount_paise)}</p>
                  {hasCompareAt && <p className="text-sm text-muted line-through">{formatCurrency(plan.compare_at_amount_paise as number)}</p>}
                </div>
                {plan.description && <p className="text-sm text-muted">{plan.description}</p>}
                {Array.isArray(plan.benefits) && plan.benefits.length > 0 && (
                  <ul className="text-sm list-disc pl-5 space-y-1">
                    {plan.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
                  </ul>
                )}
                {isPlanDisabled && <p className="text-xs text-muted">You already have an active Featured plan. Choose a higher plan to upgrade/extend visibility.</p>}
                <Button
                  className="w-full"
                  disabled={!canPromote || isPlanDisabled || Boolean(processingPlanKey) || isCheckoutOpen || isVerifying}
                  onClick={() => handlePlanPurchase(plan)}
                >
                  {processingPlanKey === plan.plan_key || isCheckoutOpen || isVerifying
                    ? "Processing..."
                    : disabledReason === "current"
                      ? "Current Active Plan"
                      : disabledReason === "lower"
                        ? "Lower Than Active Plan"
                        : "Select & Pay"}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
