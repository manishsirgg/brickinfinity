import type { BuyerProperty } from "./types";
const money = (n: number | null | undefined) => n == null || !Number.isFinite(Number(n)) ? "Not disclosed" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export function comparisonPrice(p: BuyerProperty) {
  if (p.listing_type?.toLowerCase() !== "rent") return { amount: p.price, period: "Sale price" };
  if (Number(p.hourly_rate) > 0) return { amount: p.hourly_rate, period: "per hour" };
  if (Number(p.daily_rate) > 0) return { amount: p.daily_rate, period: "per day" };
  if (Number(p.monthly_rate) > 0) return { amount: p.monthly_rate, period: "per month" };
  return { amount: p.price, period: "rental period not disclosed" };
}
export function comparisonRows(properties: BuyerProperty[]) {
  const rows: [string, (p: BuyerProperty) => string][] = [
    ["Listing type", p => [p.property_type, p.listing_type].filter(Boolean).join(" · ") || "Not disclosed"],
    ["Price", p => { const value = comparisonPrice(p); return `${money(value.amount)} · ${value.period}`; }],
    ["Built-up area", p => Number(p.built_up_area) > 0 ? `${Number(p.built_up_area).toLocaleString("en-IN")} sqft` : "Not disclosed"],
    ["Price per sqft", p => { const value = comparisonPrice(p); return Number(p.built_up_area) > 0 && value.amount != null ? `${money(Number(value.amount) / Number(p.built_up_area))} / sqft · ${value.period}` : "Not disclosed"; }],
    ["Location", p => [p.localities?.name, p.cities?.name].filter(Boolean).join(", ") || "Not disclosed"],
    ["Amenities", p => p.amenities?.length ? p.amenities.join(", ") : "Not disclosed"],
    ["Furnishing", p => p.furnishing_status || "Not disclosed"],
    ["Refundable deposit", p => p.listing_type?.toLowerCase() === "rent" ? money(p.security_deposit) : "Not applicable"],
    ["Other rental rates", p => p.listing_type?.toLowerCase() === "rent" ? [["Hourly", p.hourly_rate], ["Daily", p.daily_rate], ["Monthly", p.monthly_rate]].filter(([, value]) => value != null).map(([label, value]) => `${label}: ${money(Number(value))}`).join("\n") || "Not disclosed" : "Not applicable"],
  ];
  return rows.map(([label, getter]) => ({ label, values: properties.map(getter) }));
}
