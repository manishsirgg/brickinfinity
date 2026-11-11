import { createClient } from "@/lib/supabase/client";
import type { OwnerFields } from "@/lib/owner-verification";

type OwnerProfile = { id: string; role?: string; seller_identity?: string | null; full_name?: string | null; kyc_status?: string | null };
export async function loadOwnerListingDefaults(profile: OwnerProfile): Promise<OwnerFields> {
  if (profile.role === "admin") return {};
  const kind = profile.seller_identity;
  if (kind === "owner") return { owner_kind: kind, owner_legal_name: profile.kyc_status === "approved" ? profile.full_name?.trim() || "" : "" };
  if (kind === "project_owner_builder") {
    // A person's KYC name is not evidence of an owning company's legal name.
    // Reuse an evidence-reviewed company name when one exists; otherwise ask
    // for the company name rather than inventing it from the account holder.
    const { data, error } = await createClient().from("ownership_reviews").select("owner_legal_name,properties!inner(seller_id)")
      .eq("properties.seller_id", profile.id).eq("owner_kind", kind).eq("decision", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return { owner_kind: kind, owner_legal_name: "" };
    return { owner_kind: kind, owner_legal_name: data?.owner_legal_name || "" };
  }
  return { owner_kind: null, owner_legal_name: "" };
}
