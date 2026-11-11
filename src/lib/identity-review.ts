export const IDENTITY_TYPES = ["aadhar", "passport", "driving_license", "selfie"] as const;
export type IdentityType = typeof IDENTITY_TYPES[number];
export const identityLabel = (type: string) => ({ aadhar: "Aadhaar", passport: "Passport", driving_license: "Driving License", selfie: "Selfie" }[type] || type);
export type IdentityProfile = { id: string; full_name?: string; email?: string; phone?: string; owner_declaration_at?: string | null; seller_identity?: string | null; kyc_status?: string; seller_status?: string };
export type IdentityDocument = { id: string; user_id: string; document_type: string; document_url: string; status: string; created_at: string; rejection_reason?: string | null; users?: IdentityProfile | null };
export type IdentityApplication = { user_id: string; profile: IdentityProfile | null; documents: IdentityDocument[] };

export function latestIdentityDocuments(documents: IdentityDocument[]) {
  const seen = new Set<string>();
  return documents.slice().sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).filter(doc => {
    if (!(IDENTITY_TYPES as readonly string[]).includes(doc.document_type) || seen.has(doc.document_type)) return false;
    seen.add(doc.document_type); return true;
  });
}

export function groupIdentityApplications(documents: IdentityDocument[]) {
  const grouped = new Map<string, IdentityApplication>();
  for (const doc of documents) {
    const group = grouped.get(doc.user_id) || { user_id: doc.user_id, profile: doc.users || null, documents: [] };
    group.documents.push(doc); grouped.set(doc.user_id, group);
  }
  return Array.from(grouped.values()).map(group => ({ ...group, documents: latestIdentityDocuments(group.documents) })).filter(group => group.documents.some(doc => doc.status === "pending"));
}
