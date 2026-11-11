export type OwnerKind = "owner" | "project_owner_builder";
export type OwnerFields = { owner_kind?: string | null; owner_legal_name?: string | null; owner_project_name?: string | null; owner_attested?: boolean };
export type VerificationFields = { listing_source?: string | null; ownership_review_status?: string | null; ownership_reviewed_at?: string | null; identity_reviewed_at?: string | null; listing_reviewed_at?: string | null };
export function ownerKindLabel(kind?: string | null) {
  return kind === "owner" ? "Actual property owner" : kind === "project_owner_builder" ? "Project-owning builder" : "Not declared";
}
export function validateOwnerFields(value: OwnerFields, isAdmin = false, declaredOwnerKind?: string | null) {
  if (isAdmin) return null;
  if (!["owner", "project_owner_builder"].includes(value.owner_kind || "")) return "Choose actual owner or project-owning builder.";
  if (!value.owner_legal_name?.trim()) return "Enter the legal owner name shown on the ownership evidence.";
  if (value.owner_kind === "project_owner_builder" && !value.owner_project_name?.trim()) return "Enter the project owned by your builder company.";
  if (!value.owner_attested) return "Confirm that you are the actual owner or project-owning builder, not an agent or broker.";
  if (declaredOwnerKind !== undefined) {
    if (!["owner", "project_owner_builder"].includes(declaredOwnerKind || "")) return "Save your owner-only listing declaration on Profile before saving a property.";
    if (value.owner_kind !== declaredOwnerKind) return `Owner category mismatch: your Profile declaration is ${ownerKindLabel(declaredOwnerKind)}, but this property is marked ${ownerKindLabel(value.owner_kind)}. Select the matching category only if it is accurate; otherwise correct your declaration on Profile. Builder listings also require the owning company's project name.`;
  }
  return null;
}
export function listingIdentityLabel(value: VerificationFields) {
  if (value.listing_source === "brickinfinity_admin") return "Listed by BrickInfinity";
  if (value.ownership_review_status !== "approved" || !value.ownership_reviewed_at) return "Owner verification pending";
  return value.listing_source === "project_owner_builder" ? "Project-owning builder" : value.listing_source === "owner" ? "Property owner" : "Owner verification pending";
}
