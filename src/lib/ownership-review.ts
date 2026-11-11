import type { OwnerFields } from "@/lib/owner-verification";

export function ownershipReviewBlockers(owner: OwnerFields, checks: Record<string, boolean>, note: string) {
  const blockers: string[] = [];
  if (!owner.owner_legal_name?.trim()) blockers.push("The seller must enter the legal owner name on Edit Property.");
  if (!["owner", "project_owner_builder"].includes(owner.owner_kind || "")) blockers.push("The seller must choose actual owner or project-owning builder on Edit Property.");
  if (!owner.owner_attested) blockers.push("The seller must accept the property ownership declaration on Edit Property.");
  if (owner.owner_kind === "project_owner_builder" && !owner.owner_project_name?.trim()) blockers.push("The seller must enter the project owned by the builder company.");
  if (!["identity_matches", "property_matches", "owns_property", "no_agent", ...(owner.owner_kind === "project_owner_builder" ? ["company_owns_project"] : [])].every(key => checks[key])) blockers.push("Complete every ownership checklist item after reviewing the evidence.");
  if (!note.trim()) blockers.push("Enter a review note. A note is required for both approval and rejection.");
  return blockers;
}

export function ownershipReviewError(error: { code?: string; message?: string }) {
  if (error.code === "42P01" || /relation .+ does not exist/i.test(error.message || "")) {
    return "The database review workflow could not resolve a required table. A database administrator must apply the owner review trigger compatibility migration. The decision was not saved; your note is retained below.";
  }
  return error.message || "The ownership decision could not be saved. Your note is retained; please try again.";
}
