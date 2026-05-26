import Link from "next/link";
import { classifyFinanceStatus, fetchFeaturedOrders, isPaid, isStalePendingOrder, STALE_PENDING_MINUTES } from "@/lib/admin-finance";
import CancelStaleOrderButton from "@/components/admin/CancelStaleOrderButton";

const pageSize = 15;

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format((paise || 0) / 100);
}

function badgeClass(kind: "green" | "red" | "yellow" | "slate" | "blue") {
  const map = {
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    yellow: "bg-yellow-100 text-yellow-800",
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-800",
  };
  return `inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${map[kind]}`;
}

export default async function AdminFinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const search = String(params.q ?? "").toLowerCase();
  const pay = String(params.payment ?? "all").toLowerCase();
  const act = String(params.activation ?? "all").toLowerCase();
  const range = String(params.range ?? "all").toLowerCase();
  const page = Math.max(1, Number(params.page ?? 1));
  const orders = await fetchFeaturedOrders();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const seven = new Date(now); seven.setDate(now.getDate() - 6);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const withStatus = orders.map((o) => ({ ...o, financeStatus: classifyFinanceStatus(o) }));

  const filtered = withStatus.filter((o) => {
    const hay = [o.users?.full_name, o.users?.email, o.users?.phone, o.properties?.title, o.razorpay_order_id, o.razorpay_payment_id].join(" ").toLowerCase();
    const date = new Date(o.paid_at || o.created_at);
    const dateOk = range === "all" || (range === "today" && date >= todayStart) || (range === "7d" && date >= seven) || (range === "month" && date >= monthStart);
    const actStatus = String(o.activation_status ?? "").toLowerCase();
    const payOk = pay === "all"
      || (pay === "paid" && o.financeStatus === "revenue_success")
      || (pay === "pending" && o.financeStatus === "pending_payment")
      || (pay === "failed" && o.financeStatus === "real_failed_payment")
      || (pay === "cancelled_stale" && ["stale_cancelled", "cancelled_by_user"].includes(o.financeStatus));
    const actOk = act === "all" || actStatus === act;
    return (!search || hay.includes(search)) && dateOk && payOk && actOk;
  });

  const totalRevenue = withStatus.filter((o) => isPaid(o.payment_status)).reduce((sum, o) => sum + (o.amount_paise || 0), 0);
  const revenueThisMonth = withStatus.filter((o) => isPaid(o.payment_status) && new Date(o.paid_at || o.created_at) >= monthStart).reduce((sum, o) => sum + (o.amount_paise || 0), 0);
  const successfulPayments = withStatus.filter((o) => o.financeStatus === "revenue_success").length;
  const failedPayments = withStatus.filter((o) => o.financeStatus === "real_failed_payment").length;
  const pendingPayments = withStatus.filter((o) => o.financeStatus === "pending_payment").length;
  const cancelledOrStale = withStatus.filter((o) => ["stale_cancelled", "cancelled_by_user"].includes(o.financeStatus)).length;
  const activePurchases = withStatus.filter((o) => o.financeStatus === "revenue_success" && String(o.activation_status).toLowerCase() === "active").length;
  const scheduledPurchases = withStatus.filter((o) => o.financeStatus === "revenue_success" && String(o.activation_status).toLowerCase() === "scheduled").length;
  console.info("[admin-finance] featured summary counts", { successfulPayments, activePurchases, scheduledPurchases });
  const manualReview = withStatus.filter((o) => o.financeStatus === "manual_review").length;

  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  return <div className="max-w-7xl mx-auto p-8 space-y-6">
    <h1 className="text-2xl font-semibold">Finance & Payments — Property Featured</h1>
    {params.success === "stale_cancelled" && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">Stale pending order cancelled successfully.</p>}
    {params.error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">Unable to cancel stale pending order. Please review eligibility and retry.</p>}
    <div className="grid md:grid-cols-4 gap-3 text-sm">{[
      ["Total Revenue", formatInr(totalRevenue)], ["Revenue This Month", formatInr(revenueThisMonth)], ["Successful Payments", successfulPayments], ["Failed Payments", failedPayments],
      ["Pending Payments", pendingPayments], ["Cancelled / Stale Orders", cancelledOrStale], ["Active Featured Purchases", activePurchases], ["Scheduled Featured Purchases", scheduledPurchases], ["Manual Review", manualReview],
    ].map(([k,v]) => <div key={String(k)} className="bg-white border rounded-xl p-4"><div className="text-gray-500">{k}</div><div className="font-semibold text-lg">{String(v)}</div></div>)}</div>

    <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-xl p-3">Revenue is calculated only from successfully paid local Featured orders. Pending, failed, cancelled, and stale unpaid Razorpay orders are excluded.</p>

    <form className="bg-white border rounded-xl p-4 grid md:grid-cols-5 gap-2 text-sm">
      <input name="q" defaultValue={search} placeholder="Search seller/property/Razorpay ref" className="border rounded px-3 py-2 md:col-span-2" />
      <select name="payment" defaultValue={pay} className="border rounded px-2 py-2"><option value="all">All payment</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled_stale">Cancelled/Stale</option></select>
      <select name="activation" defaultValue={act} className="border rounded px-2 py-2"><option value="all">All activation</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
      <select name="range" defaultValue={range} className="border rounded px-2 py-2"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="month">This month</option></select>
      <button className="border rounded px-4 py-2">Apply</button>
    </form>

    <div className="bg-white border rounded-xl overflow-auto">
      <table className="min-w-full text-xs"><thead><tr className="border-b bg-gray-50"><th className="p-2 text-left">Date</th><th className="p-2 text-left">Seller</th><th className="p-2 text-left">Property</th><th className="p-2 text-left">Plan</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Statuses</th><th className="p-2 text-left">Razorpay refs</th><th className="p-2 text-left">Action</th></tr></thead>
      <tbody>
        {pageRows.length === 0 && <tr><td className="p-4" colSpan={8}>No Featured Listing payments found yet.</td></tr>}
        {pageRows.map((o) => {
          const isStalePending = isStalePendingOrder(o);
          const paymentBadge = o.financeStatus === "revenue_success" || o.financeStatus === "manual_review" ? ["Paid", "green"] as const
            : o.financeStatus === "pending_payment" ? ["Pending", "yellow"] as const
            : o.financeStatus === "real_failed_payment" ? ["Failed", "red"] as const
            : ["Cancelled", "slate"] as const;

          const activationBadge = o.financeStatus === "revenue_success" ? [String(o.activation_status).toLowerCase() === "scheduled" ? "Scheduled" : String(o.activation_status).toLowerCase() === "active" ? "Active" : "Needs Review", String(o.activation_status).toLowerCase() === "active" || String(o.activation_status).toLowerCase() === "scheduled" ? "blue" : "red"] as const
            : o.financeStatus === "pending_payment" ? ["Pending", "yellow"] as const
            : o.financeStatus === "real_failed_payment" ? ["Not Activated", "red"] as const
            : o.financeStatus === "stale_cancelled" ? ["Stale / Superseded", "slate"] as const
            : o.financeStatus === "cancelled_by_user" ? ["Cancelled by User", "slate"] as const
            : ["Needs Review", "red"] as const;

          return <tr key={o.id} className="border-b align-top"><td className="p-2">{new Date(o.created_at).toLocaleString()}<div className="text-gray-500">Paid: {o.paid_at ? new Date(o.paid_at).toLocaleString() : "-"}</div></td><td className="p-2">{o.users?.full_name || "-"}<div>{o.users?.email || "-"}</div><div>{o.users?.phone || "-"}</div></td><td className="p-2">{o.properties?.title || "-"}<div className="text-gray-500">{o.property_id || "-"}</div></td><td className="p-2">{o.plan_name || "-"}</td><td className="p-2">{formatInr(o.amount_paise)}<div>{o.currency || "INR"}</div></td><td className="p-2 space-y-1"><div className={badgeClass(paymentBadge[1])}>{paymentBadge[0]}</div><div><span className={badgeClass(activationBadge[1])}>{activationBadge[0]}</span></div>{String(o.activation_status).toLowerCase()==="scheduled" && <div className="text-slate-600">Scheduled from: {o.featured_starts_at ? new Date(o.featured_starts_at).toLocaleString() : "Scheduled start pending"}</div>}{isStalePending && <div><span className={badgeClass("slate")}>Stale Pending</span></div>}{o.financeStatus === "stale_cancelled" && <div className="text-slate-600">Unpaid Razorpay order cancelled because a successful paid order already exists.</div>}{isStalePending && <div className="text-slate-600">This order is unpaid and older than {STALE_PENDING_MINUTES} minutes. It may be safely cancelled if no payment was completed.</div>}{o.financeStatus === "real_failed_payment" && <div className="text-red-600">{o.failure_reason || "Payment failed or verification failed."}</div>}</td><td className="p-2"><div>{o.razorpay_order_id || "-"}</div><div>{o.razorpay_payment_id || "-"}</div></td><td className="p-2 space-y-2"><Link className="underline block" href={`/admin/finance/property-featured/${o.id}`}>View details</Link>{isStalePending && <CancelStaleOrderButton orderId={o.id} className="underline text-red-700 disabled:opacity-50" successRedirect="/admin/finance?success=stale_cancelled" />}</td></tr>;
        })}
      </tbody></table>
    </div>
    <div className="flex gap-2 text-sm">{Array.from({ length: pages }).map((_, i) => <Link key={i} className={`px-3 py-1 border rounded ${page===i+1?"bg-black text-white":""}`} href={`/admin/finance?page=${i+1}&q=${encodeURIComponent(search)}&payment=${pay}&activation=${act}&range=${range}`}>{i+1}</Link>)}</div>
    <div className="bg-white border rounded-xl p-4 text-sm"><h2 className="font-semibold mb-2">Diagnostics</h2><ul className="list-disc pl-5"><li>Paid orders with missing activation_status: {withStatus.filter((o)=>isPaid(o.payment_status) && !o.activation_status).length}</li><li>Paid orders not active/scheduled: {manualReview}</li><li>Orders with Razorpay payment id but unpaid local status: {withStatus.filter((o)=>o.razorpay_payment_id && !isPaid(o.payment_status)).length}</li><li>Active/scheduled orders with missing property featured flag: {withStatus.filter((o)=>["active","scheduled"].includes(String(o.activation_status).toLowerCase()) && o.properties?.is_featured === false).length}</li></ul></div>
  </div>;
}
