export function isFeaturePromotableStatus(status?: string | null) {
  return ["approved", "active"].includes(String(status || "").toLowerCase());
}
