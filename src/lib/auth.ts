import { createClient } from "@/lib/supabase/server";
import { USER_ROLES, UserRole } from "@/types/roles";

export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
  role: UserRole;
  kycStatus: string;
  sellerStatus: string;
  fullName: string;
  avatarUrl: string | null;
} | null> {

  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;

  const { data: userRecord } = await supabase
    .from("users")
    .select("role, kyc_status, seller_status, full_name, avatar_url")
    .eq("user_id", session.user.id)
    .maybeSingle();

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: (userRecord?.role as UserRole) ?? USER_ROLES.BUYER,
    kycStatus: userRecord?.kyc_status ?? "not_submitted",
    sellerStatus: userRecord?.seller_status ?? "basic",
    fullName: userRecord?.full_name ?? "",
    avatarUrl: userRecord?.avatar_url ?? null,
  };
}