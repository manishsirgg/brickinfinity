import Link from "next/link";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { classifyFinanceStatus, fetchFeaturedOrders, isStalePendingOrder, STALE_PENDING_MINUTES } from "@/lib/admin-finance";

export default async function OrderDetail({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const orders = await fetchFeaturedOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) notFound();

  const financeStatus = classifyFinanceStatus(order);
  const isStalePending = isStalePendingOrder(order);

  async function cancelStaleAction() {
    "use server";
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/api/admin/finance/property-featured/orders/${orderId}/cancel-stale`, { method: "POST", cache: "no-store" });
    if (!response.ok) redirect(`/admin/finance/property-featured/${orderId}?error=cancel_stale_failed`);
    redirect("/admin/finance?success=stale_cancelled");
  }

  return <div className="max-w-5xl mx-auto p-8 space-y-6 text-sm">
    <div className="flex justify-between"><h1 className="text-2xl font-semibold">Featured Payment Detail</h1><Link href="/admin/finance" className="underline">Back</Link></div>
    {financeStatus === "stale_cancelled" && <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700">This was an unpaid stale Razorpay order. It was cancelled because a successful paid Featured order already exists. It is not counted as revenue and does not require action.</div>}
    {financeStatus === "real_failed_payment" && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700">Payment failed or verification failed. Review Razorpay/payment logs if the user reports deduction.</div>}
    {financeStatus === "manual_review" && <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-800">Payment appears successful but activation is not active/scheduled. Review reconciliation.</div>}
    {isStalePending && <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-800">This order is still unpaid and older than {STALE_PENDING_MINUTES} minutes. If Razorpay shows no successful payment for this order, you may cancel it as stale.</div>}

    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Payment Details</h2><div>Local order id: {order.id}</div><div>Razorpay order id: {order.razorpay_order_id || "-"}</div><div>Razorpay payment id: {order.razorpay_payment_id || "-"}</div><div>Amount/Currency: {(order.amount_paise/100).toFixed(2)} {order.currency || "INR"}</div><div>Payment status: {order.payment_status || "-"}</div><div>Activation status: {order.activation_status || "-"}</div><div>Created at: {order.created_at}</div><div>Paid at: {order.paid_at || "-"}</div><div>Updated at: {order.updated_at || "-"}</div><div>Failure reason: {order.failure_reason || "-"}</div><pre className="bg-gray-50 border rounded p-2 overflow-auto">{JSON.stringify(order.metadata || {}, null, 2)}</pre></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Seller Details</h2><div>ID: {order.users?.id || order.owner_id || "-"}</div><div>Name: {order.users?.full_name || "-"}</div><div>Email: {order.users?.email || "-"}</div><div>Phone: {order.users?.phone || "-"}</div><div>WhatsApp: {order.users?.whatsapp_number || "-"}</div></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Property Details</h2><div>ID: {order.properties?.id || order.property_id || "-"}</div><div>Title: {order.properties?.title || "-"}</div><div>Status: {order.properties?.status || "-"}</div><div>Featured now: {String(order.properties?.is_featured ?? "-")}</div><div>Featured until: {order.properties?.featured_until || "-"}</div></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Plan Details</h2><div>Plan id: {order.plan_id || "-"}</div><div>Plan name: {order.plan_name || "-"}</div><div>Duration: {order.duration_days || "-"} days</div><div>Amount: {(order.amount_paise/100).toFixed(2)} {order.currency || "INR"}</div></section>
    <div className="flex gap-4 items-center"><Link href="/admin/property-featured/reconciliation" className="underline">Open Reconciliation</Link>{isStalePending && <form action={cancelStaleAction}><button type="submit" className="px-3 py-2 rounded bg-red-600 text-white">Cancel stale pending order</button></form>}</div>
  </div>;
}
