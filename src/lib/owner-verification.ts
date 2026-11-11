export type OwnerKind = "owner" | "project_owner_builder";
export type OwnerFields = { owner_kind?: string | null; owner_legal_name?: string | null; owner_project_name?: string | null; owner_attested?: boolean };
export type VerificationFields = { listing_source?: string | null; ownership_review_status?: string | null; ownership_reviewed_at?: string | null; identity_reviewed_at?: string | null; listing_reviewed_at?: string | null };
export function validateOwnerFields(value: OwnerFields, isAdmin = false) {
  if (isAdmin) return null;
  if (!["owner", "project_owner_builder"].includes(value.owner_kind || "")) return "Choose actual owner or project-owning builder.";
  if (!value.owner_legal_name?.trim()) return "Enter the legal owner name shown on the ownership evidence.";
  if (value.owner_kind === "project_owner_builder" && !value.owner_project_name?.trim()) return "Enter the project owned by your builder company.";
  if (!value.owner_attested) return "Confirm that you are the actual owner or project-owning builder, not an agent or broker.";
  return null;
}
export function listingIdentityLabel(value: VerificationFields) {
  if (value.listing_source === "brickinfinity_admin") return "Listed by BrickInfinity";
  if (value.ownership_review_status !== "approved" || !value.ownership_reviewed_at) return "Owner verification pending";
  return value.listing_source === "project_owner_builder" ? "Project-owning builder" : value.listing_source === "owner" ? "Property owner" : "Owner verification pending";
}
