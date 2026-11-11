import { listingIdentityLabel, type VerificationFields } from "@/lib/owner-verification";
export default function VerificationBadges({ property }: { property: VerificationFields }) {
  const badges = [property.identity_reviewed_at ? "Identity reviewed" : null, property.ownership_review_status === "approved" && property.ownership_reviewed_at ? property.listing_source === "project_owner_builder" ? "Builder/project documents reviewed" : "Ownership documents reviewed" : null, property.listing_reviewed_at ? "Listing reviewed by BrickInfinity" : null].filter(Boolean);
  return <div className="space-y-2"><p className="text-xs font-medium text-slate-600">{listingIdentityLabel(property)}</p><div className="flex flex-wrap gap-2">{badges.map(badge => <span key={badge} title="Documents reviewed by BrickInfinity. This is not a guarantee of clear legal title." className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800">✓ {badge}</span>)}</div></div>;
}
