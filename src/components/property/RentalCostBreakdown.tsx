import { RENTAL_FEES, type RentalDetails } from "@/lib/property-rental-details";
type Props = { property: RentalDetails & { monthly_rate?: number | null; daily_rate?: number | null; hourly_rate?: number | null; price?: number | null } };
const money = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export default function RentalCostBreakdown({ property }: Props) {
  const monthly = property.monthly_rate;
  const monthlyFees = RENTAL_FEES.filter(fee => fee.period === "Monthly");
  const complete = RENTAL_FEES.every(fee => property[fee.key] !== null && property[fee.key] !== undefined);
  const knownMonthly = Number(monthly || 0) + monthlyFees.reduce((sum, fee) => sum + Number(property[fee.key] || 0), 0);
  const knownUpfront = knownMonthly + RENTAL_FEES.filter(fee => fee.period === "One-time").reduce((sum, fee) => sum + Number(property[fee.key] || 0), 0);
  return <section className="card-soft min-w-0 space-y-4 p-4 sm:p-6"><h2 className="text-xl font-semibold">Rental cost breakdown</h2>
    <dl className="space-y-3 text-sm">
      {[["Monthly rent", property.monthly_rate], ["Daily rent", property.daily_rate], ["Hourly rent", property.hourly_rate]].filter(([, value]) => value !== null && value !== undefined).map(([label,value]) => <div key={String(label)} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-semibold">{money(Number(value))}</dd></div>)}
      {!property.monthly_rate && !property.daily_rate && !property.hourly_rate && <div className="flex flex-wrap justify-between gap-2"><dt>Advertised rent · confirm period with seller</dt><dd>{money(Number(property.price || 0))}</dd></div>}
      {RENTAL_FEES.map(fee => <div key={fee.key} className="flex flex-wrap justify-between gap-2"><dt>{fee.label}<span className="block text-xs text-slate-500">{fee.period}</span></dt><dd className="font-medium">{property[fee.key] === null || property[fee.key] === undefined ? "Not disclosed" : money(Number(property[fee.key]))}</dd></div>)}
      <div className="flex flex-wrap justify-between gap-2"><dt>Rent negotiable</dt><dd>{property.price_negotiable == null ? "Not disclosed" : property.price_negotiable ? "Yes" : "No"}</dd></div>
    </dl>
    {monthly != null && <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm"><p>{monthlyFees.every(fee => property[fee.key] != null) ? "Monthly total" : "Known monthly subtotal"}: <strong>{money(knownMonthly)}</strong></p><p>{complete ? "Estimated move-in payment" : "Known move-in subtotal"}: <strong>{money(knownUpfront)}</strong></p><p className="text-xs text-slate-500">Includes first month’s rent, monthly extras and disclosed one-time charges, including the refundable deposit. {complete ? "Confirm payment terms with the seller." : "Undisclosed charges are excluded; this is not a final payable total."}</p></div>}
    {property.other_charges_note && <p className="whitespace-pre-wrap break-words text-sm">{property.other_charges_note}</p>}
  </section>;
}
