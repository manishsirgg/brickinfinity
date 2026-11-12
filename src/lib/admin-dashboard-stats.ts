import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadAdminDashboardStats(supabase: SupabaseClient) {
  const results = await Promise.all([
    supabase.rpc("count_pending_identity_applications").then(({ data, error }) => ({ count: typeof data === "number" ? data : null, error })),
    // Count properties, not individual supporting files; match Ownership's pending state.
    supabase.from("properties").select("id,documents!inner(id)", { count: "exact", head: true })
      .eq("status", "pending").eq("ownership_verified", false).eq("ownership_review_status", "unreviewed")
      .is("deleted_at", null).eq("documents.document_type", "ownership").eq("documents.status", "pending"),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null),
    // Match the Listings queue, including staff-created inventory.
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "pending")
      .or("and(ownership_verified.eq.true,verification_status.in.(ownership_approved,approved)),listing_source.eq.brickinfinity_admin").is("deleted_at", null),
    supabase.from("property_reports").select("id", { count: "exact", head: true }),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id, users:seller_id!inner(role)", { count: "exact", head: true }).eq("users.role", "admin"),
  ]);
  const names = ["KYC", "ownership reviews", "pending properties", "publication reviews", "reports", "users", "leads"];
  results.forEach((result, index) => {
    if (result.error) throw new Error(`Could not load ${names[index]}: ${result.error.message}`);
    if (result.count === null) throw new Error(`No count returned for ${names[index]}. Please refresh.`);
  });
  const [kyc, ownership, properties, ready, reports, users, leads] = results.map(result => result.count!);
  return { kyc, ownership, properties, ready, reports, users, leads };
}
