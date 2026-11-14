import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RemoveComparisonColumn, EmptyComparison } from "@/components/buyer/CompareControls";
import { availabilityLabel } from "@/lib/property-rental-details";
import type { BuyerProperty } from "@/lib/buyer/types";
import { comparisonRows } from "@/lib/buyer/compare";
export const metadata = { title: "Compare properties | BrickInfinity", robots: { index: false, follow: false } };
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: raw } = await searchParams;
  const ids = [...new Set((typeof raw === "string" ? raw : "").split(",").map(id => id.trim().toLowerCase()).filter(Boolean))];
  const invalid = ids.length > 3 || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
  let properties: BuyerProperty[] = [], error = "";
  if (ids.length && !invalid) {
    const { data, error: queryError } = await (await createClient()).rpc("get_comparison_properties", { p_ids: ids });
    if (queryError) error = "Comparison could not be loaded. Please try again."; else properties = data || [];
  }
  const rows = comparisonRows(properties);
  return <main className="container-custom py-12 space-y-6"><h1 className="text-3xl font-bold">Compare properties</h1><p className="text-muted">Compare up to three listings. Built-up area is in square feet. Rental amounts retain their advertised period; hourly, daily and monthly rates are not equivalent.</p>
    {(invalid || error) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{invalid ? "Choose up to three valid property IDs." : error}</p>}
    {ids.length > properties.length && !invalid && !error && <p className="rounded-xl bg-amber-50 p-4">Some selected properties are no longer publicly available and have been excluded.</p>}
    {!properties.length ? <EmptyComparison /> : <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] border-collapse text-sm"><caption className="sr-only">Side-by-side comparison of selected properties</caption><thead><tr><th scope="col" className="w-40 border-b bg-slate-50 p-4 text-left">Feature</th>{properties.map(p => <th key={p.id} scope="col" className="min-w-52 border-b p-4 text-left align-top"><Link className="font-semibold underline" href={`/property/${p.id}/${p.slug || "property"}`}>{p.title || p.property_type || "Property"}</Link><div className="mt-3"><RemoveComparisonColumn propertyId={p.id} ids={ids} /></div></th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row" className="border-b bg-slate-50 p-4 text-left font-medium">{row.label}</th>{row.values.map((value, i) => <td key={properties[i].id} className="border-b p-4 align-top whitespace-pre-line">{value}</td>)}</tr>)}<tr><th scope="row" className="bg-slate-50 p-4 text-left font-medium">Availability</th>{properties.map(p => <td key={p.id} className="p-4">{availabilityLabel(p)}</td>)}</tr></tbody></table></div>}
    <Link href="/properties" className="inline-block underline">Browse more properties</Link>
  </main>;
}
