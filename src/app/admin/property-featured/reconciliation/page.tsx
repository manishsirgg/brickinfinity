"use client";

import { FormEvent, useState } from "react";

type ReconcileResponse = {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
  data?: {
    local_order_id?: string;
    property_id?: string;
    property_title?: string | null;
    plan?: string;
    amount_paise?: number;
    currency?: string;
    payment_status?: string;
    activation_status?: string;
    activation?: {
      featured_starts_at?: string | null;
      featured_ends_at?: string | null;
    };
  };
};

export default function FeaturedReconciliationPage() {
  const [orderId, setOrderId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResponse | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/property-featured/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: orderId.trim(),
          razorpay_payment_id: paymentId.trim() || undefined,
        }),
      });

      const data = (await response.json()) as ReconcileResponse;
      setResult(data);
    } catch (error) {
      setResult({ error: "Unexpected error while reconciling payment." });
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2">Featured Payment Reconciliation</h1>
      <p className="text-sm text-gray-600 mb-6">
        Use this tool to reconcile captured Razorpay payments for Featured Listing orders.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 border rounded-xl p-6 bg-white">
        <div>
          <label className="block text-sm font-medium mb-1">Razorpay Order ID</label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
            placeholder="order_xxx"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Razorpay Payment ID (optional)</label>
          <input
            value={paymentId}
            onChange={(e) => setPaymentId(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="pay_xxx"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !orderId.trim()}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-60"
        >
          {loading ? "Reconciling..." : "Reconcile Payment"}
        </button>
      </form>

      {result && (
        <div className="mt-6 border rounded-xl p-6 bg-gray-50">
          <p className="font-semibold mb-2">Result</p>
          {result.error ? (
            <div className="text-red-700 space-y-1 text-sm">
              <p>{result.error}</p>
              {result.code && <p>Code: {result.code}</p>}
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <p className="text-green-700">{result.message ?? "Reconciled successfully."}</p>
              <p>Status: {result.status ?? "-"}</p>
              <p>Local Order ID: {result.data?.local_order_id ?? "-"}</p>
              <p>Property: {result.data?.property_title || result.data?.property_id || "-"}</p>
              <p>Plan: {result.data?.plan ?? "-"}</p>
              <p>
                Amount: {typeof result.data?.amount_paise === "number" ? (result.data.amount_paise / 100).toFixed(2) : "-"}{" "}
                {result.data?.currency ?? ""}
              </p>
              <p>Payment Status: {result.data?.payment_status ?? "-"}</p>
              <p>Activation Status: {result.data?.activation_status ?? "-"}</p>
              <p>Featured Starts At: {result.data?.activation?.featured_starts_at ?? "-"}</p>
              <p>Featured Ends At: {result.data?.activation?.featured_ends_at ?? "-"}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
