"use client";

import { useEffect, useMemo, useState } from "react";

type Plan = { id: string; name: string; plan_key: string; amount_paise: number; currency: string };
type PropertyPreview = { id: string; title: string | null; status: string | null; seller_id: string | null; deleted_at: string | null } | null;

type RazorpayPaymentRow = { payment_id: string; order_id: string | null; amount: number; currency: string; status: string; contact: string | null; email: string | null; localOrderFound: boolean; localOrderId: string | null; propertyId?: string | null; canReconcile: boolean; canRecover: boolean; alreadyReconciled: boolean; label: string; localPaymentStatus: string | null; localActivationStatus?: string | null; matchedBy?: "razorpay_order_id" | "razorpay_payment_id" | null; detectedFromRazorpayNotes?: boolean; detectedPropertyId?: string | null; detectedOwnerId?: string | null; detectedPlanId?: string | null; detectedPlanKey?: string | null; detectedPurpose?: string | null; detectedPropertyTitle?: string | null; detectedPropertyStatus?: string | null; detectedPlanName?: string | null; detectedPlanAmountPaise?: number | null; detectedPlanCurrency?: string | null; amountMatchesDetectedPlan?: boolean; currencyMatchesDetectedPlan?: boolean; canRecoverFromDetectedNotes?: boolean; };
type LocalOrderRow = { local_order_id: string; property_title: string | null; payment_status: string | null; activation_status: string | null; created_at: string; razorpay_payment_id: string | null; paid_at?: string | null; amount_paise: number; currency: string | null; };

export default function FeaturedReconciliationPage() {
  const [scannerRows, setScannerRows] = useState<RazorpayPaymentRow[]>([]);
  const [recentLocalOrders, setRecentLocalOrders] = useState<LocalOrderRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingScanner, setLoadingScanner] = useState(false);
  const [loadingLocalOrders, setLoadingLocalOrders] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [recoveringPaymentId, setRecoveringPaymentId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [propertyPreview, setPropertyPreview] = useState<PropertyPreview>(null);
  const [showAlreadyReconciled, setShowAlreadyReconciled] = useState(true);

  const fetchScanner = async () => { setLoadingScanner(true); const res = await fetch("/api/admin/property-featured/reconcile/razorpay-payments?count=30&onlyCaptured=true"); const json = await res.json(); setScannerRows(json.data ?? []); setLoadingScanner(false); };
  const fetchPlans = async () => { const res = await fetch('/api/property-featured/plans'); const json = await res.json(); setPlans(json.plans ?? []); };
  const fetchLocalOrders = async () => { setLoadingLocalOrders(true); const res = await fetch('/api/admin/property-featured/reconcile/queue'); const json = await res.json(); setRecentLocalOrders(json.recentOrders ?? []); setLoadingLocalOrders(false); };

  useEffect(() => { fetchScanner(); fetchPlans(); fetchLocalOrders(); }, []);

  const fetchPropertyPreview = async () => {
    if (!selectedPropertyId.trim()) return;
    const res = await fetch(`/api/properties/${selectedPropertyId.trim()}`);
    const json = await res.json();
    setPropertyPreview(json.property ? { id: json.property.id, title: json.property.title ?? null, status: json.property.status ?? null, seller_id: json.property.seller_id ?? null, deleted_at: json.property.deleted_at ?? null } : null);
  };

  const recover = async (row: RazorpayPaymentRow, source: "admin_razorpay_scanner" | "razorpay_notes_detected" = "admin_razorpay_scanner") => {
    if (row.localOrderFound) return;
    const response = await fetch('/api/admin/property-featured/reconcile/recover-missing-local-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: row.order_id, razorpay_payment_id: row.payment_id, property_id: selectedPropertyId.trim(), plan_id: selectedPlanId, source }) });
    const data = await response.json();
    setResult(data);
    await fetchScanner();
    await fetchLocalOrders();
  };

  const cancelStaleOrder = async (localOrderId: string) => {
    const response = await fetch('/api/admin/property-featured/reconcile/cancel-stale-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ local_order_id: localOrderId }) });
    const data = await response.json();
    setResult(data);
    await fetchLocalOrders();
  };

  const bulkCancelStaleOrders = async () => {
    const response = await fetch('/api/admin/property-featured/reconcile/cancel-stale-orders', { method: 'POST' });
    const data = await response.json();
    setResult(data);
    await fetchLocalOrders();
  };

  const selectedPlan = useMemo(() => plans.find((p) => p.id === selectedPlanId) ?? null, [plans, selectedPlanId]);
  const visibleScannerRows = useMemo(() => showAlreadyReconciled ? scannerRows : scannerRows.filter((row) => !row.alreadyReconciled), [scannerRows, showAlreadyReconciled]);
  const isStaleCancellable = (row: LocalOrderRow) => ["created", "pending"].includes(String(row.payment_status ?? "").toLowerCase()) && ["created", "pending"].includes(String(row.activation_status ?? "").toLowerCase()) && !row.razorpay_payment_id && !row.paid_at;

  return <div className="max-w-7xl mx-auto p-8 space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Featured Payment Reconciliation Queue</h1><button onClick={fetchScanner} className="px-3 py-2 rounded bg-black text-white">{loadingScanner ? "Refreshing..." : "Refresh Razorpay Payments"}</button></div>

    <section className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Recent Local Orders</h2><div className="flex gap-2"><button onClick={fetchLocalOrders} className="px-2 py-1 rounded border text-sm">{loadingLocalOrders ? "Refreshing..." : "Refresh Local"}</button><button onClick={bulkCancelStaleOrders} className="px-2 py-1 rounded bg-red-700 text-white text-sm">Cancel stale {'>'}60 min</button></div></div>
      <div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">Local Order</th><th className="p-2 text-left">Property</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Statuses</th><th className="p-2 text-left">Created</th><th className="p-2 text-left">Action</th></tr></thead><tbody>{recentLocalOrders.map((o)=><tr key={o.local_order_id} className="border-b align-top"><td className="p-2">{o.local_order_id}</td><td className="p-2">{o.property_title || '-'}</td><td className="p-2">{(Number(o.amount_paise || 0)/100).toFixed(2)} {o.currency || 'INR'}</td><td className="p-2"><div>Payment: <span className={String(o.payment_status).toLowerCase() === 'cancelled' ? 'text-red-700 font-semibold' : ''}>{o.payment_status || '-'}</span></div><div>Activation: <span className={String(o.activation_status).toLowerCase() === 'cancelled' ? 'text-red-700 font-semibold' : ''}>{o.activation_status || '-'}</span></div></td><td className="p-2">{new Date(o.created_at).toLocaleString()}</td><td className="p-2">{isStaleCancellable(o) ? <button onClick={() => cancelStaleOrder(o.local_order_id)} className="px-2 py-1 rounded bg-red-600 text-white">Cancel stale order</button> : '-'}</td></tr>)}</tbody></table></div>
    </section>

    <section className="border rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Razorpay Captured Payments</h2>
        <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={showAlreadyReconciled} onChange={(e) => setShowAlreadyReconciled(e.target.checked)} /> Show already reconciled payments</label>
      </div>
      <div className="overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b"><th className="p-2 text-left">Payment</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Contact</th><th className="p-2 text-left">Local match</th><th className="p-2 text-left">Action</th></tr></thead><tbody>{visibleScannerRows.map((p)=><tr key={p.payment_id} className="border-b align-top"><td className="p-2">{p.payment_id}<div>{p.order_id || "-"}</div></td><td className="p-2">{(p.amount/100).toFixed(2)} {p.currency}<div>{p.status}</div></td><td className="p-2">{p.contact || "-"}<div>{p.email || "-"}</div></td><td className="p-2">{p.localOrderFound ? <div><div>{p.localOrderId} / {p.propertyId || '-'} ({p.localPaymentStatus || "-"}, {p.localActivationStatus || "-"})</div><span className={`px-2 py-1 rounded ${p.alreadyReconciled ? 'bg-green-100 text-green-700' : p.canReconcile ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>{p.alreadyReconciled ? "Already Reconciled" : p.label}</span></div> : p.canRecoverFromDetectedNotes ? <div><div>{p.detectedPropertyTitle || p.detectedPropertyId} / {p.detectedPlanName || p.detectedPlanKey || p.detectedPlanId}</div><span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded">Detected Property/Plan</span></div> : <span className="px-2 py-1 bg-orange-100 rounded">Needs Manual Review</span>}</td><td className="p-2">{p.canReconcile ? <button onClick={async () => { const response = await fetch('/api/admin/property-featured/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ local_order_id: p.localOrderId, razorpay_order_id: p.order_id, razorpay_payment_id: p.payment_id, source: 'razorpay_scanner' }) }); const data = await response.json(); setResult(data); await fetchScanner(); await fetchLocalOrders(); }} className="px-2 py-1 rounded bg-blue-600 text-white">Reconcile</button> : (!p.localOrderFound && p.canRecoverFromDetectedNotes) ? <button onClick={() => { setRecoveringPaymentId(p.payment_id); setSelectedPropertyId(p.detectedPropertyId || ''); setSelectedPlanId(plans.find((pl) => pl.plan_key === p.detectedPlanKey)?.id || p.detectedPlanId || ''); setPropertyPreview(null); }} className="px-2 py-1 rounded text-white bg-emerald-600">Recover Detected Order</button> : (!p.localOrderFound && p.canRecover && !p.canRecoverFromDetectedNotes) ? <button onClick={() => { setRecoveringPaymentId(p.payment_id); setSelectedPropertyId(''); setSelectedPlanId(''); setPropertyPreview(null); }} className="px-2 py-1 rounded text-white bg-orange-600">Recover Manually</button> : <span className="text-gray-500">{p.alreadyReconciled ? "Already Reconciled" : "Local Order Exists — Review"}</span>}</td></tr>)}</tbody></table></div>
    </section>

    {recoveringPaymentId && (() => { const row = scannerRows.find((r) => r.payment_id === recoveringPaymentId); if (!row) return null; return <section className="border rounded-xl p-4 bg-white space-y-3">
      <h3 className="font-semibold">Manual Recovery (Admin only)</h3>
      <p className="text-sm text-orange-700">Manual fallback — use only if Razorpay notes are missing or incorrect.</p>
      <div className="text-sm">Payment: <b>{row.payment_id}</b> | Order: <b>{row.order_id}</b> | Amount: <b>{(row.amount/100).toFixed(2)} {row.currency}</b></div>
      {row.canRecoverFromDetectedNotes && <div className="text-xs border rounded p-2 bg-emerald-50">Detected from Razorpay notes: Property <b>{row.detectedPropertyTitle || row.detectedPropertyId}</b> ({row.detectedPropertyStatus || '-'}) • Plan <b>{row.detectedPlanName || row.detectedPlanKey || row.detectedPlanId}</b> ({((Number(row.detectedPlanAmountPaise || 0))/100).toFixed(2)} {row.detectedPlanCurrency || 'INR'})</div>}
      <div className="space-y-2">
        <input value={selectedPropertyId} onChange={(e)=>setSelectedPropertyId(e.target.value)} className="w-full border rounded px-3 py-2" placeholder="Property ID (uuid)" />
        <button onClick={fetchPropertyPreview} className="px-2 py-1 rounded border">Fetch Property</button>
        {propertyPreview && <div className="text-xs border rounded p-2">Property: {propertyPreview.title || propertyPreview.id} | Status: {propertyPreview.status || '-'} | Owner: {propertyPreview.seller_id || '-'}</div>}
        <select value={selectedPlanId} onChange={(e)=>setSelectedPlanId(e.target.value)} className="w-full border rounded px-3 py-2"><option value="">Select plan (id/key accepted by API)</option>{plans.map((pl)=><option key={pl.id} value={pl.id}>{pl.name} ({(pl.amount_paise/100).toFixed(2)} {pl.currency})</option>)}</select>
        {selectedPlan && <div className="text-xs text-gray-600">Plan selected: {selectedPlan.name} / {selectedPlan.plan_key} / {(selectedPlan.amount_paise/100).toFixed(2)} {selectedPlan.currency}</div>}
      </div>
      <div className="flex gap-2"><button disabled={!selectedPropertyId.trim() || !selectedPlanId} onClick={() => recover(row, row.canRecoverFromDetectedNotes ? "razorpay_notes_detected" : "admin_razorpay_scanner")} className="px-3 py-2 rounded bg-black text-white disabled:opacity-50">Recover & Activate</button><button onClick={() => setRecoveringPaymentId(null)} className="px-3 py-2 rounded border">Cancel</button></div>
    </section>; })()}

    {result && <div className="border rounded-xl p-4 bg-gray-50 text-sm"><div className="font-semibold mb-1">Result Panel</div><div>Status: {result.status ?? result.code ?? (result.success ? 'success' : '-')}</div><div>Message: {result.message ?? result.error ?? '-'}</div>{result?.data && <div className="mt-2 space-y-1"><div>Local Order: {result.data.local_order_id || '-'}</div></div>}</div>}
  </div>;
}
