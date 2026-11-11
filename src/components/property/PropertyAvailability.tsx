import { availabilityLabel, needsAvailabilityConfirmation, type RentalDetails } from "@/lib/property-rental-details";
export default function PropertyAvailability({ property }: { property: RentalDetails }) {
  const confirmed = property.availability_confirmed_at;
  return <div className="space-y-1 text-sm"><span title="Availability is reported by the owner or admin. Confirm it before visiting." className="inline-block rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">{availabilityLabel(property)}</span>
    <p className="text-xs text-slate-500">{confirmed ? `Availability confirmed ${new Date(confirmed).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}` : "Ask the seller to confirm current availability."}{confirmed && needsAvailabilityConfirmation(property) ? " · Reconfirmation due" : ""}</p>
  </div>;
}
