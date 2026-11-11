export type SellerAccessProfile = {
  role?: string | null;
  kycStatus?: string | null;
  sellerStatus?: string | null;
  ownerDeclared?: boolean;
  declarationLocked?: boolean;
};

export function sellerDashboardAccess(profile: SellerAccessProfile) {
  if (profile.role === "admin") return { allowed: true, reason: "ready", href: "/dashboard" };
  if (!profile.ownerDeclared) return { allowed: false, reason: "declaration", href: "/profile?access=declaration#seller-access" };
  if (profile.declarationLocked && profile.kycStatus === "pending" && profile.sellerStatus === "pending_seller" && ["buyer", "seller"].includes(profile.role || "")) return { allowed: false, reason: "identity-review", href: "/seller-review" };
  if (profile.kycStatus !== "approved") return { allowed: false, reason: "identity", href: "/profile?access=identity#seller-access" };
  if (profile.role !== "seller" || profile.sellerStatus !== "active") return { allowed: false, reason: "activation", href: "/profile?access=activation#seller-access" };
  return { allowed: true, reason: "ready", href: "/dashboard" };
}
