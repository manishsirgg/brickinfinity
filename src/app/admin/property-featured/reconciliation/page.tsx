"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type RazorpayStatus = {
  hasCapturedPayment: boolean;
  capturedPaymentId: string | null;
  paymentStatus: string | null;
  amount: number | null;
  currency: string | null;
  amountMatches: boolean;
  currencyMatches: boolean;
  capturedAt: string | null;
} | null;

type OrderRow = {
  local_order_id: string;
  property_id: string;
  property_title: string | null;
  owner_id: string;
  plan_id: string | null;
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
  updated_at: string;
  classification: string;
  classification_reason: string;
  can_reconcile: boolean;
  razorpayStatus?: RazorpayStatus;
};

type QueueResponse = {
  success: boolean;
  diagnostics: Record<string, number>;
  queue: OrderRow[];
  recentOrders: OrderRow[];
};

type RazorpayPaymentRow = {
  payment_id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  contact: string | null;
  email: string | null;
  created_at: string;
  localOrderFound: boolean;
  localOrderId: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  plan: string | null;
  localPaymentStatus: string | null;
  localStatus: string | null;
  canReconcile: boolean;
};

export default function FeaturedReconciliationPage() {
  const [queue, setQueue] = useState<OrderRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [diagnostics, setDiagnostics] = useState<Record<string, number>>({});
  const [scannerRows, setScannerRows] = useState<RazorpayPaymentRow[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [result, setResult] = useState<any>(null);

  const fetchQueue = async () => {
    setLoadingQueue(true);
    const res = await fetch(`/api/admin/property-featured/reconcile/queue?checkRazorpay=${autoCheck}`);
    const json = (await res.json()) as QueueResponse;
    setQueue(json.queue ?? []);
    setRecentOrders(json.recentOrders ?? []);
    setDiagnostics(json.diagnostics ?? {});
    setLoadingQueue(false);
  };

  const fetchScanner = async () => {
    setLoadingScanner(true);
    const res = await fetch("/api/admin/property-featured/reconcile/razorpay-payments?count=30&onlyCaptured=true");
    const json = await res.json();
    setScannerRows(json.data ?? []);
    setLoadingScanner(false);
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
    await Promise.all([fetchQueue(), fetchScanner()]);
  };

  const checkRazorpay = async (row: OrderRow) => {
    const response = await fetch("/api/admin/property-featured/reconcile/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ razorpay_order_id: row.razorpay_order_id }),
    });
    const data = await response.json();
    const razorpayStatus = { hasCapturedPayment: data.hasCapturedPayment, capturedPaymentId: data.capturedPaymentId, paymentStatus: data.paymentStatus, amount: data.amount, currency: data.currency, amountMatches: data.amount === row.amount_paise, currencyMatches: (data.currency || "").toUpperCase() === (row.currency || "INR").toUpperCase(), capturedAt: data.capturedAt ?? null };
    setQueue((prev) => prev.map((q) => q.local_order_id === row.local_order_id ? { ...q, razorpayStatus } : q));
  };

  const sortedQueue = useMemo(() => queue, [queue]);

  return <div className="max-w-7xl mx-auto p-8 space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Featured Payment Reconciliation Queue</h1>
      <div className="flex items-center gap-3">
        <label className="text-sm"><input type="checkbox" checked={autoCheck} onChange={(e)=>setAutoCheck(e.target.checked)} className="mr-2"/>Auto-check Razorpay</label>
        <button onClick={fetchQueue} className="px-3 py-2 rounded bg-black text-white">{loadingQueue ? "Refreshing..." : "Refresh Queue"}</button>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
      <div className="border rounded p-3">Total recent orders: <b>{diagnostics.totalRecentFeaturedOrders ?? 0}</b></div>
      <div className="border rounded p-3">Pending queue count: <b>{diagnostics.returnedQueueCount ?? 0}</b></div>
      <div className="border rounded p-3">Already paid/active: <b>{diagnostics.alreadyPaidOrActive ?? 0}</b></div>
      <div className="border rounded p-3">Orders with Razorpay ID: <b>{diagnostics.withRazorpayOrderId ?? 0}</b></div>
      <div className="border rounded p-3">Unpaid or pending: <b>{diagnostics.unpaidOrPending ?? 0}</b></div>
      <div className="border rounded p-3">Hidden by status filter: <b>{diagnostics.hiddenByStatusFilter ?? 0}</b></div>
    </div>

    {sortedQueue.length === 0 && <div className="border rounded-xl p-4 bg-yellow-50 text-sm">No unreconciled local featured orders found. Check Recent Orders or Razorpay Captured Payments.</div>}

    <div className="border rounded-xl overflow-auto bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-100"><tr><th className="p-2 text-left">Order</th><th className="p-2 text-left">Property</th><th className="p-2">Amount</th><th className="p-2">Badges</th><th className="p-2">Actions</th></tr></thead>
        <tbody>{sortedQueue.map((row) => <tr key={row.local_order_id} className="border-t align-top">
          <td className="p-2">{row.local_order_id}<div className="text-xs text-gray-500">{row.razorpay_order_id}</div></td>
          <td className="p-2">{row.property_title || row.property_id}<div className="text-xs text-gray-500">{row.plan_name || row.plan_key}</div></td>
          <td className="p-2 text-center">{(row.amount_paise / 100).toFixed(2)} {row.currency || "INR"}</td>
          <td className="p-2 space-x-1"><span className="px-2 py-1 rounded bg-yellow-100">{row.classification}</span>{row.razorpayStatus?.hasCapturedPayment ? <span className="px-2 py-1 rounded bg-green-100">Razorpay Captured</span> : <span className="px-2 py-1 rounded bg-gray-100">Needs Manual Review</span>}</td>
          <td className="p-2 space-x-2"><button onClick={() => checkRazorpay(row)} className="px-2 py-1 rounded border">Check Razorpay</button><button disabled={!row.can_reconcile} onClick={() => reconcile({ local_order_id: row.local_order_id, source: "queue" })} className="px-2 py-1 rounded bg-black text-white disabled:opacity-50">Reconcile</button></td>
        </tr>)}</tbody>
      </table>
    </div>

    <section className="border rounded-xl p-4 bg-white space-y-3">
      <h2 className="font-semibold">Recent Local Orders</h2>
      <div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="text-left p-2">Local</th><th className="text-left p-2">Property</th><th className="text-left p-2">Plan</th><th className="text-left p-2">Status</th><th className="text-left p-2">Razorpay</th><th className="text-left p-2">Classification</th><th className="text-left p-2">Action</th></tr></thead><tbody>{recentOrders.map((r)=><tr key={`recent-${r.local_order_id}`} className="border-b"><td className="p-2">{r.local_order_id}<div>{new Date(r.created_at).toLocaleString()}</div></td><td className="p-2">{r.property_title || r.property_id}</td><td className="p-2">{r.plan_name || r.plan_key}<div>{(r.amount_paise/100).toFixed(2)} {r.currency || "INR"}</div></td><td className="p-2">{r.status}/{r.payment_status}</td><td className="p-2">{r.razorpay_order_id}<div>{r.razorpay_payment_id || "-"}</div></td><td className="p-2">{r.classification}<div className="text-gray-500">{r.classification_reason}</div></td><td className="p-2">{r.can_reconcile ? <button onClick={() => reconcile({ local_order_id: r.local_order_id, source: "recent" })} className="px-2 py-1 rounded bg-black text-white">Reconcile</button> : "-"}</td></tr>)}</tbody></table></div>
    </section>

    <section className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Razorpay Captured Payments</h2><button onClick={fetchScanner} className="px-3 py-2 rounded bg-black text-white">{loadingScanner ? "Refreshing..." : "Refresh Razorpay Payments"}</button></div>
      <div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">Payment</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Contact</th><th className="p-2 text-left">Local match</th><th className="p-2 text-left">Action</th></tr></thead><tbody>{scannerRows.map((p)=><tr key={p.payment_id} className="border-b"><td className="p-2">{p.payment_id}<div>{p.order_id || "-"}</div></td><td className="p-2">{(p.amount/100).toFixed(2)} {p.currency}<div>{p.status}</div></td><td className="p-2">{p.contact || "-"}<div>{p.email || "-"}</div></td><td className="p-2">{p.localOrderFound ? `${p.localOrderId} (${p.localPaymentStatus || "-"})` : <span className="px-2 py-1 bg-orange-100 rounded">Needs Manual Review</span>}</td><td className="p-2">{p.canReconcile && p.localOrderId ? <button onClick={() => { if (!p.localOrderId) return; reconcile({ local_order_id: p.localOrderId, razorpay_payment_id: p.payment_id, source: "razorpay_scanner" }); }} className="px-2 py-1 rounded bg-black text-white">Reconcile</button> : "-"}</td></tr>)}</tbody></table></div>
    </section>

    <details open={manualOpen} onToggle={(e)=>setManualOpen((e.target as HTMLDetailsElement).open)} className="border rounded-xl p-4 bg-white">
      <summary className="font-medium cursor-pointer">Manual fallback reconciliation</summary>
      <form onSubmit={(e: FormEvent)=>{e.preventDefault(); reconcile({ razorpay_order_id: orderId.trim(), razorpay_payment_id: paymentId.trim() || undefined as any, source: "manual" });}} className="mt-4 space-y-3">
        <input value={orderId} onChange={(e)=>setOrderId(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="razorpay order id" />
        <input value={paymentId} onChange={(e)=>setPaymentId(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="payment id optional" />
        <button className="px-3 py-2 rounded bg-black text-white">Reconcile Manually</button>
      </form>
    </details>

    {result && <div className="border rounded-xl p-4 bg-gray-50 text-sm"><div className="font-semibold mb-1">Result Panel</div><div>Status: {result.status ?? result.code ?? "-"}</div><div>Reconciliation Status: {result.message ?? result.error ?? "-"}</div></div>}
  </div>;
}
