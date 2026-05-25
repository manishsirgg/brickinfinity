import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchFeaturedOrders } from "@/lib/admin-finance";

export default async function OrderDetail({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const orders = await fetchFeaturedOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) notFound();

  return <div className="max-w-5xl mx-auto p-8 space-y-6 text-sm">
    <div className="flex justify-between"><h1 className="text-2xl font-semibold">Featured Payment Detail</h1><Link href="/admin/finance" className="underline">Back</Link></div>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Payment Details</h2><div>Local order id: {order.id}</div><div>Razorpay order id: {order.razorpay_order_id || "-"}</div><div>Razorpay payment id: {order.razorpay_payment_id || "-"}</div><div>Amount/Currency: {(order.amount_paise/100).toFixed(2)} {order.currency || "INR"}</div><div>Payment status: {order.payment_status || "-"}</div><div>Activation status: {order.activation_status || "-"}</div><div>Created at: {order.created_at}</div><div>Paid at: {order.paid_at || "-"}</div><div>Updated at: {order.updated_at || "-"}</div><div>Failure reason: {order.failure_reason || "-"}</div><pre className="bg-gray-50 border rounded p-2 overflow-auto">{JSON.stringify(order.metadata || {}, null, 2)}</pre></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Seller Details</h2><div>ID: {order.users?.id || order.owner_id || "-"}</div><div>Name: {order.users?.full_name || "-"}</div><div>Email: {order.users?.email || "-"}</div><div>Phone: {order.users?.phone || "-"}</div><div>WhatsApp: {order.users?.whatsapp_number || "-"}</div></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Property Details</h2><div>ID: {order.properties?.id || order.property_id || "-"}</div><div>Title: {order.properties?.title || "-"}</div><div>Status: {order.properties?.status || "-"}</div><div>Featured now: {String(order.properties?.is_featured ?? "-")}</div><div>Featured until: {order.properties?.featured_until || "-"}</div></section>
    <section className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">Plan Details</h2><div>Plan id: {order.plan_id || "-"}</div><div>Plan name: {order.plan_name || "-"}</div><div>Duration: {order.duration_days || "-"} days</div><div>Amount: {(order.amount_paise/100).toFixed(2)} {order.currency || "INR"}</div></section>
    <div className="flex gap-4"><Link href="/admin/property-featured/reconciliation" className="underline">Open Reconciliation</Link></div>
  </div>
}
