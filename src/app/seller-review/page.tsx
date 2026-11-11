import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sellerDashboardAccess } from "@/lib/seller-dashboard-access";

export default async function SellerReviewDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = sellerDashboardAccess(user);
  if (access.allowed) redirect("/dashboard");
  if (access.reason !== "identity-review") redirect(access.href);
  const db = await createClient();
  const { data: profile, error: profileError } = await db.from("users").select("id").eq("user_id", user.id).single();
  if (profileError || !profile) redirect("/profile");
  // Ordinary session/RLS client, exact owner scope, and no mutation/CRM actions.
  const { data: properties, error, count } = await db.from("properties").select("id,title,status,ownership_review_status,views_count", { count: "exact" }).eq("seller_id", profile.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(50);
  return <main className="container-custom min-w-0 space-y-6 py-10">
    <h1 className="text-2xl font-semibold">Seller dashboard — identity review</h1>
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p>Your identity documents are being reviewed again. You can view your listing status here while review is pending. Creating, editing, promoting and publishing listings remain restricted until seller access is active.</p><Link className="inline-flex rounded-lg border bg-white px-3 py-2" href="/profile#seller-access">Complete verification and track review on Profile</Link></div>
    <p className="text-sm">Your listings: {count ?? "—"}. Showing up to the latest 50.</p>
    {error ? <p role="alert" className="text-red-700">Your listing status could not be loaded. Refresh this page to try again.</p> : !properties?.length ? <p>No existing listings found.</p> : <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">{properties.map(property => <li key={property.id} className="min-w-0 space-y-2 rounded-xl border bg-white p-4"><h2 className="break-words font-semibold">{property.title || "Untitled property"}</h2><p className="text-sm">Listing status: {property.status}</p><p className="text-sm">Ownership review: {property.ownership_review_status || "unreviewed"}</p><p className="text-sm">Views: {Number(property.views_count || 0).toLocaleString("en-IN")}</p></li>)}</ul>}
  </main>;
}
