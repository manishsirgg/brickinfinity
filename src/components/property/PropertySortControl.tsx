"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PROPERTY_SORTS, parsePropertySort } from "@/lib/property-result-options";

export default function PropertySortControl({ values }: { values: Record<string, string | undefined> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <form action="/properties" method="get" className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-label="Sort property results">
    {Object.entries(values).filter(([key, value]) => value && key !== "sort" && key !== "page").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    <label htmlFor="property-sort" className="text-sm font-medium">Sort by</label>
    <select id="property-sort" name="sort" disabled={pending} defaultValue={parsePropertySort(values.sort)}
      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:flex-none"
      onChange={event => {
        const query = new URLSearchParams();
        Object.entries(values).forEach(([key, value]) => { if (value && key !== "page") query.set(key, value); });
        query.set("sort", event.target.value);
        startTransition(() => router.push(`/properties?${query}`));
      }}>
      {Object.entries(PROPERTY_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <noscript><button type="submit" className="rounded-lg border px-3 py-2 text-sm">Sort</button></noscript>
    {pending && <span role="status" className="text-xs text-slate-500">Sorting…</span>}
  </form>;
}
