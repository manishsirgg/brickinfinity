export const IDENTITY_TYPES = ["aadhar", "passport", "driving_license", "selfie"] as const;
export type IdentityType = typeof IDENTITY_TYPES[number];
export const identityLabel = (type: string) => ({ aadhar: "Aadhaar", passport: "Passport", driving_license: "Driving License", selfie: "Selfie" }[type] || type);
export type IdentityProfile = { id: string; full_name?: string; email?: string; phone?: string; owner_declaration_at?: string | null; seller_identity?: string | null; kyc_status?: string; seller_status?: string };
export type IdentityDocument = { id: string; user_id: string; document_type: string; document_url: string; status: string; created_at: string | null; rejection_reason?: string | null; users?: IdentityProfile | null };
export type IdentityApplication = { user_id: string; profile: IdentityProfile | null; documents: IdentityDocument[] };

export function latestIdentityDocuments(documents: IdentityDocument[]) {
  const seen = new Set<string>();
  const created = (value: string | null) => {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : -Infinity;
  };
  return documents.slice().sort((a, b) => created(b.created_at) - created(a.created_at) || b.id.localeCompare(a.id)).filter(doc => {
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

/** Stable evidence/declaration snapshot used to reject decisions on stale previews. */
export function identityApplicationSnapshot(profile: IdentityProfile | null, documents: IdentityDocument[]) {
  return {
    full_name: profile?.full_name ?? null,
    kyc_status: profile?.kyc_status ?? null,
    seller_status: profile?.seller_status ?? null,
    seller_identity: profile?.seller_identity ?? null,
    owner_declaration_at: profile?.owner_declaration_at ?? null,
    documents: latestIdentityDocuments(documents).sort((a, b) => a.id.localeCompare(b.id)).map(doc => ({ id: doc.id, document_url: doc.document_url, status: doc.status })),
  };
}
export function identityCapacityLabel(value?: string | null) {
  return ({ owner: "Actual property owner", project_owner_builder: "Builder whose company owns the project" } as Record<string, string>)[value || ""] || "Not declared";
}
