import { hasPropertyContactDetails } from "@/lib/property-description-policy";
export const RENTAL_FEES = [
  { key: "security_deposit", label: "Refundable security deposit", period: "One-time" },
  { key: "maintenance_charges", label: "Maintenance", period: "Monthly" },
  { key: "parking_charge", label: "Parking charges", period: "Monthly" },
  { key: "other_monthly_charges", label: "Other recurring charges", period: "Monthly" },
  { key: "other_one_time_charges", label: "Other one-time charges", period: "One-time" },
] as const;
export const PUBLIC_AVAILABILITY = ["unknown", "available", "available_from"];
export type RentalDetails = { brokerage_charge?: string | number | null; availability_status?: string; available_from?: string | null; availability_confirmed_at?: string | null; price_negotiable?: boolean | null; other_charges_note?: string | null } & Partial<Record<typeof RENTAL_FEES[number]["key"], string | number | null>>;
export function rentalDetailsPayload(value: RentalDetails, isRent: boolean) {
  const result: Record<string, string | number | boolean | null> = {
    brokerage_charge: isRent ? 0 : null,
    availability_status: value.availability_status || "unknown",
    available_from: value.availability_status === "available_from" ? value.available_from || null : null,
    price_negotiable: isRent ? value.price_negotiable ?? null : null,
    other_charges_note: isRent ? value.other_charges_note?.trim() || null : null,
  };
  if (value.other_charges_note && (value.other_charges_note.length > 500 || hasPropertyContactDetails(value.other_charges_note))) throw new Error("Charge details must be at most 500 characters without contact details.");
  if (![...PUBLIC_AVAILABILITY, "rented", "sold", "unavailable"].includes(String(result.availability_status))) throw new Error("Choose a valid availability status.");
  if (result.availability_status === "available_from" && (!result.available_from || !/^\d{4}-\d{2}-\d{2}$/.test(String(result.available_from)) || !Number.isFinite(Date.parse(String(result.available_from))))) throw new Error("Choose an available-from date.");
  for (const fee of RENTAL_FEES) {
    const raw = value[fee.key];
    if ((!isRent && fee.key !== "maintenance_charges") || raw === "" || raw === undefined || raw === null) result[fee.key] = null;
    else { const amount = Number(raw); if (!Number.isFinite(amount) || amount < 0) throw new Error(`${fee.label} must be a non-negative amount.`); result[fee.key] = amount; }
  }
  return result;
}
export function needsAvailabilityConfirmation(value: RentalDetails, now = Date.now()) {
  const date = Date.parse(value.availability_confirmed_at || "");
  return !Number.isFinite(date) || now - date >= 30 * 86400000;
}
export function availabilityLabel(value: RentalDetails) {
  if (value.availability_status === "available_from" && value.available_from) return `Available from ${new Date(value.available_from + "T12:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`;
  return ({ available: "Available now", rented: "Rented", sold: "Sold", unavailable: "Currently unavailable" } as Record<string,string>)[value.availability_status || ""] || "Availability not confirmed";
}
