export const SELLER_CRM_DEAL_STAGES = [
  "new_deal",
  "qualified",
  "property_shared",
  "site_visit_scheduled",
  "site_visit_done",
  "negotiation",
  "token_advance_pending",
  "token_advance_received",
  "agreement_pending",
  "agreement_completed",
  "closed_won",
  "closed_lost",
] as const;

export type SellerCrmDealStageValue = (typeof SELLER_CRM_DEAL_STAGES)[number];

export const SELLER_CRM_DEAL_STAGE_LABELS: Record<SellerCrmDealStageValue, string> = {
  new_deal: "New Deal",
  qualified: "Qualified",
  property_shared: "Property Shared",
  site_visit_scheduled: "Site Visit Scheduled",
  site_visit_done: "Site Visit Done",
  negotiation: "Negotiation",
  token_advance_pending: "Token / Advance Pending",
  token_advance_received: "Token / Advance Received",
  agreement_pending: "Agreement Pending",
  agreement_completed: "Agreement Completed",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export function isSellerCrmDealStage(value: unknown): value is SellerCrmDealStageValue {
  return typeof value === "string" && (SELLER_CRM_DEAL_STAGES as readonly string[]).includes(value);
}

export function formatSellerCrmDealStage(value: string | null | undefined): string {
  if (!value) return "—";
  return SELLER_CRM_DEAL_STAGE_LABELS[value as SellerCrmDealStageValue] ?? value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
