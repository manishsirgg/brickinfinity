"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type QueueRow = {
  local_order_id: string;
  property_id: string;
  property_title: string | null;
  plan_key: string | null;
  plan_name: string | null;
  amount_paise: number;
  currency: string | null;
  status: string | null;
  payment_status: string | null;
  activation_status: string | null;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  created_at: string;
  razorpayStatus?: {
    hasCapturedPayment: boolean;
    capturedPaymentId: string | null;
    paymentStatus: string | null;
    amount: number | null;
    currency: string | null;
    amountMatches: boolean;
    currencyMatches: boolean;
    capturedAt: string | null;
  } | null;
};

export default function FeaturedReconciliationPage() {
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [result, setResult] = useState<any>(null);

  const fetchQueue = async () => {
    setLoadingQueue(true);
    const res = await fetch(`/api/admin/property-featured/reconcile/queue?checkRazorpay=${autoCheck}`);
    const json = await res.json();
    setQueue(json.data ?? []);
    setLoadingQueue(false);
  };

  useEffect(() => { fetchQueue(); }, [autoCheck]);

  const reconcile = async (payload: Record<string, string>) => {
    const response = await fetch("/api/admin/property-featured/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setResult(data);
    await fetchQueue();
  };

  const checkRazorpay = async (row: QueueRow) => {
    const response = await fetch("/api/admin/property-featured/reconcile/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id: row.razorpay_order_id }),
    });
    const data = await response.json();
    setQueue((prev) => prev.map((q) => q.local_order_id === row.local_order_id ? { ...q, razorpayStatus: { hasCapturedPayment: data.hasCapturedPayment, capturedPaymentId: data.capturedPaymentId, paymentStatus: data.paymentStatus, amount: data.amount, currency: data.currency, amountMatches: data.amount === row.amount_paise, currencyMatches: (data.currency || "").toUpperCase() === (row.currency || "INR").toUpperCase(), capturedAt: data.capturedAt ?? null } } : q));
  };

  const sorted = useMemo(() => queue, [queue]);

  return <div className="max-w-7xl mx-auto p-8 space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Featured Payment Reconciliation Queue</h1>
      <div className="flex items-center gap-3">
        <label className="text-sm"><input type="checkbox" checked={autoCheck} onChange={(e)=>setAutoCheck(e.target.checked)} className="mr-2"/>Auto-check Razorpay</label>
        <button onClick={fetchQueue} className="px-3 py-2 rounded bg-black text-white">{loadingQueue ? "Refreshing..." : "Refresh Queue"}</button>
      </div>
    </div>

    <div className="border rounded-xl overflow-auto bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-100"><tr><th className="p-2 text-left">Order</th><th className="p-2 text-left">Property</th><th className="p-2">Amount</th><th className="p-2">Badges</th><th className="p-2">Actions</th></tr></thead>
        <tbody>
          {sorted.map((row) => {
            const ready = Boolean(row.razorpayStatus?.hasCapturedPayment && row.razorpayStatus?.amountMatches && row.razorpayStatus?.currencyMatches);
            const already = row.payment_status === "paid" || row.activation_status === "active";
            return <tr key={row.local_order_id} className="border-t align-top">
              <td className="p-2">{row.local_order_id}<div className="text-xs text-gray-500">{row.razorpay_order_id}</div></td>
              <td className="p-2">{row.property_title || row.property_id}<div className="text-xs text-gray-500">{row.plan_name || row.plan_key}</div></td>
              <td className="p-2 text-center">{(row.amount_paise / 100).toFixed(2)} {row.currency || "INR"}</td>
              <td className="p-2 space-x-1">
                <span className="px-2 py-1 rounded bg-yellow-100">Local Pending</span>
                {row.razorpayStatus?.hasCapturedPayment ? <span className="px-2 py-1 rounded bg-green-100">Razorpay Captured</span> : <span className="px-2 py-1 rounded bg-gray-100">Needs Manual Review</span>}
                {row.razorpayStatus?.amountMatches && row.razorpayStatus?.currencyMatches && <span className="px-2 py-1 rounded bg-blue-100">Amount Matched</span>}
                {ready && <span className="px-2 py-1 rounded bg-emerald-100">Ready to Reconcile</span>}
                {already && <span className="px-2 py-1 rounded bg-purple-100">Already Reconciled</span>}
              </td>
              <td className="p-2 space-x-2">
                <button onClick={() => checkRazorpay(row)} className="px-2 py-1 rounded border">Check Razorpay</button>
                <button disabled={!ready && !already} onClick={() => reconcile({ local_order_id: row.local_order_id })} className="px-2 py-1 rounded bg-black text-white disabled:opacity-50">Reconcile</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <details open={manualOpen} onToggle={(e)=>setManualOpen((e.target as HTMLDetailsElement).open)} className="border rounded-xl p-4 bg-white">
      <summary className="font-medium cursor-pointer">Manual Reconciliation</summary>
      <form onSubmit={(e: FormEvent)=>{e.preventDefault(); reconcile({ razorpay_order_id: orderId.trim(), razorpay_payment_id: paymentId.trim() || undefined as any });}} className="mt-4 space-y-3">
        <input value={orderId} onChange={(e)=>setOrderId(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="razorpay order id" />
        <input value={paymentId} onChange={(e)=>setPaymentId(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="payment id optional" />
        <button className="px-3 py-2 rounded bg-black text-white">Reconcile Manually</button>
      </form>
    </details>

    {result && <div className="border rounded-xl p-4 bg-gray-50 text-sm">
      <div className="font-semibold mb-1">Result Panel</div>
      <div>Status: {result.status ?? result.code ?? "-"}</div>
      <div>Local Order ID: {result.data?.local_order_id ?? "-"}</div>
      <div>Property: {result.data?.property_title || result.data?.property_id || "-"}</div>
      <div>Plan: {result.data?.plan ?? "-"}</div>
      <div>Amount: {typeof result.data?.amount_paise === "number" ? (result.data.amount_paise / 100).toFixed(2) : "-"} {result.data?.currency ?? ""}</div>
      <div>Razorpay Payment ID: {result.data?.razorpay_payment_id ?? "-"}</div>
      <div>Reconciliation Status: {result.message ?? result.error ?? "-"}</div>
      <div>Activation Result: {result.data?.activation_result ?? "-"}</div>
      <div>Featured Start: {result.data?.activation?.featured_starts_at ?? "-"}</div>
      <div>Featured End: {result.data?.activation?.featured_ends_at ?? "-"}</div>
    </div>}
  </div>;
}
