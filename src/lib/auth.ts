import { createClient } from "@/lib/supabase/server";
import { USER_ROLES, UserRole } from "@/types/roles";

export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
  role: UserRole;
  kycStatus: string;
  sellerStatus: string;
  ownerDeclared: boolean;
  fullName: string;
  avatarUrl: string | null;
} | null> {

  const supabase = await createClient();

  const {
    data: { user: sessionUser }, error,
  } = await supabase.auth.getUser();

  if (error || !sessionUser) return null;

  const { data: userRecord } = await supabase
    .from("users")
    .select("role, kyc_status, seller_status, owner_declaration_at, full_name, avatar_url")
    .eq("user_id", sessionUser.id)
    .maybeSingle();

  return {
    id: sessionUser.id,
    email: sessionUser.email ?? "",
    role: (userRecord?.role as UserRole) ?? USER_ROLES.BUYER,
    kycStatus: userRecord?.kyc_status ?? "not_submitted",
    sellerStatus: userRecord?.seller_status ?? "basic",
    ownerDeclared: Boolean(userRecord?.owner_declaration_at),
    fullName: userRecord?.full_name ?? "",
    avatarUrl: userRecord?.avatar_url ?? null,
  };
}