"use client";
import { RENTAL_FEES, type RentalDetails } from "@/lib/property-rental-details";
export default function RentalAvailabilityFields({ value, onChange, isRent }: { value: RentalDetails; onChange: (patch: RentalDetails) => void; isRent: boolean }) {
  const input = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return <section className="space-y-4">
    <h3 className="text-lg font-semibold">Availability</h3>
    <label className="block text-sm">Listing availability<select aria-label="Listing availability" className={input} value={value.availability_status || "unknown"} onChange={e => onChange({ availability_status: e.target.value, available_from: null })}>
      <option value="unknown">Not confirmed</option><option value="available">Available now</option><option value="available_from">Available from a date</option><option value="rented">Rented</option><option value="sold">Sold</option><option value="unavailable">Currently unavailable</option>
    </select></label>
    {value.availability_status === "available_from" && <label className="block text-sm">Available from<input aria-label="Available from" type="date" required className={input} value={value.available_from || ""} onChange={e => onChange({ available_from: e.target.value })} /></label>}
    <p className="text-xs text-slate-500">Rented, sold and unavailable properties are hidden from public searches. Update this status when circumstances change.</p>
    {isRent && <><h3 className="text-lg font-semibold">Rental cost breakdown</h3><p className="text-sm text-slate-600">Leave an amount blank if not disclosed. Enter 0 only if there is no charge. Recurring extras below are monthly, even if short-term rent is offered.</p>
      <div className="grid gap-4 sm:grid-cols-2">{RENTAL_FEES.map(fee => <label key={fee.key} className="block text-sm">{fee.label} (₹) · {fee.period}<input aria-label={fee.label} className={input} type="number" min="0" step="0.01" placeholder="Not disclosed" value={value[fee.key] ?? ""} onChange={e => onChange({ [fee.key]: e.target.value })} /></label>)}</div>
      <label className="block text-sm">Rent negotiable<select aria-label="Rent negotiable" className={input} value={value.price_negotiable === null || value.price_negotiable === undefined ? "" : String(value.price_negotiable)} onChange={e => onChange({ price_negotiable: e.target.value === "" ? null : e.target.value === "true" })}><option value="">Not disclosed</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label className="block text-sm">Other charge details<textarea className={input} maxLength={500} value={value.other_charges_note || ""} onChange={e => onChange({ other_charges_note: e.target.value })} placeholder="Explain other charges without contact details" /></label>
    </>}
  </section>;
}
