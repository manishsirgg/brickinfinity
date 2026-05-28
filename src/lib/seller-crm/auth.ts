import { createClient } from "@/lib/supabase/server";

export async function resolveSellerCrmContext() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  console.log("[seller-crm-auth] auth user id", authUser?.id ?? null);
  if (!authUser) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: appUser, error } = await supabase
    .from("users")
    .select("id,user_id,full_name,email,phone,role,seller_status")
    .eq("user_id", authUser.id)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: "Failed to resolve app user", details: error.message };
  if (!appUser) return { ok: false as const, status: 403, error: "Forbidden" };
  console.log("[seller-crm-auth] resolved public user id", appUser.id);
  console.log("[seller-crm-auth] resolved role", appUser.role ?? null);

  return { ok: true as const, supabase, authUser, appUser, sellerId: appUser.id, role: appUser.role };
}
