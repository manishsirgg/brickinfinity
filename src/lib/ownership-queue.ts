type OwnershipProperty = { id: string; status?: string; deleted_at?: string | null; ownership_verified?: boolean; ownership_review_status?: string };
export type OwnershipQueueRow = { id: string; property_id?: string | null; document_type?: string; status?: string; created_at?: string; properties?: OwnershipProperty | OwnershipProperty[] | null };
export function ownershipQueueProperty(row: OwnershipQueueRow) {
  return Array.isArray(row.properties) ? row.properties[0] : row.properties;
}
export function isPendingOwnershipReview(row: OwnershipQueueRow) {
  const property = ownershipQueueProperty(row);
  return row.document_type === "ownership" && row.status === "pending" && !!property
    && row.property_id === property.id && property.status === "pending"
    && property.deleted_at == null && property.ownership_verified === false
    && property.ownership_review_status === "unreviewed";
}
export function pendingOwnershipQueue<T extends OwnershipQueueRow>(rows: T[]): T[] {
  const properties = new Set<string>();
  return rows.slice().sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0) || b.id.localeCompare(a.id)).filter(row => {
    if (!isPendingOwnershipReview(row) || !row.property_id || properties.has(row.property_id)) return false;
    properties.add(row.property_id); return true;
  });
}
export function ownershipDecisionConfirmed(row: OwnershipQueueRow, approve: boolean) {
  const property = ownershipQueueProperty(row);
  if (!property || row.document_type !== "ownership" || row.property_id !== property.id || property.deleted_at != null) return false;
  return approve
    ? row.status === "approved" && ["pending", "active"].includes(property.status || "") && property.ownership_verified === true && property.ownership_review_status === "approved"
    : row.status === "rejected" && property.status === "rejected" && property.ownership_verified === false && property.ownership_review_status === "rejected";
}
