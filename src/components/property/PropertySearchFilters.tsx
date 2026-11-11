"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROPERTY_SORTS, SEARCH_AMENITIES, PROPERTY_TYPES, FURNISHING_TYPES } from "@/lib/property-result-options";

type Place = { id: string; name: string };
type Props = { values: Record<string, string | undefined>; states: Place[]; cities: Place[]; localities: Place[] };

export default function PropertySearchFilters({ values, states, cities: initialCities, localities: initialLocalities }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(window.matchMedia("(min-width: 1024px)").matches); }, []);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(values.state_id || "");
  const [city, setCity] = useState(values.city_id || "");
  const [locality, setLocality] = useState(values.locality_id || "");
  const [cities, setCities] = useState(initialCities);
  const [localities, setLocalities] = useState(initialLocalities);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rangeError, setRangeError] = useState("");
  const fieldClass = "block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  async function changeLocation(level: "state" | "city", id: string) {
    setError(""); setLoading(true); setLocality(""); setLocalities([]);
    if (level === "state") { setState(id); setCity(""); setCities([]); } else setCity(id);
    try {
      if (!id) return;
      const { data, error } = await createClient().from(level === "state" ? "cities" : "localities").select("id,name").eq(level === "state" ? "state_id" : "city_id", id).order("name");
      if (error) throw error;
      if (level === "state") setCities(data || []); else setLocalities(data || []);
    } catch { setError("Locations could not be loaded. Please try selecting the location again."); }
    finally { setLoading(false); }
  }
  function numeric(label: string, name: string, placeholder: string) {
    return <label className="space-y-1 text-sm font-medium">{label}<input className={fieldClass} name={name} type="number" min="0" step="any" placeholder={placeholder} defaultValue={values[name]} /></label>;
  }
  function select(label: string, name: string, options: string[]) {
    return <label className="space-y-1 text-sm font-medium">{label}<select aria-label={label} name={name} defaultValue={values[name] || ""} className={fieldClass}><option value="">Any</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  }
  return <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="min-w-0 rounded-2xl border border-slate-200 bg-white">
    <summary className="cursor-pointer px-4 py-3 font-semibold sm:px-6">Search, filters &amp; sort</summary>
    <form action="/properties" method="get" className="min-w-0 space-y-4 border-t border-slate-200 p-4 sm:p-6" onSubmit={event => {
    const data = new FormData(event.currentTarget);
    for (const [min, max, label] of [["min_price", "max_price", "price"], ["min_area", "max_area", "area"]]) {
      if (data.get(min) && data.get(max) && Number(data.get(min)) > Number(data.get(max))) {
        event.preventDefault(); setRangeError(`Minimum ${label} cannot exceed maximum ${label}.`); return;
      }
    }
    event.preventDefault();
    setRangeError("");
    const query = new URLSearchParams();
    for (const [key, value] of data.entries()) if (String(value).trim()) query.append(key, String(value).trim());
    startTransition(() => router.push(`/properties?${query}`));
  }}>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-sm font-medium sm:col-span-2">Search<input className={fieldClass} type="search" name="search" defaultValue={values.search} placeholder="City, locality, landmark or property type" maxLength={80} /></label>
      {select("Buy or rent", "listing_type", ["Sale", "Rent"])}
      <label className="space-y-1 text-sm font-medium">Sort by<select aria-label="Sort by" className={fieldClass} name="sort" defaultValue={values.sort || "newest"}>{Object.entries(PROPERTY_SORTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">State<select aria-label="State" className={fieldClass} name="state_id" value={state} disabled={loading} onChange={e => changeLocation("state", e.target.value)}><option value="">All states</option>{states.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">City<select aria-label="City" className={fieldClass} name="city_id" value={city} disabled={loading || !state} onChange={e => changeLocation("city", e.target.value)}><option value="">All cities</option>{cities.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
      <label className="space-y-1 text-sm font-medium">Locality<select aria-label="Locality" className={fieldClass} name="locality_id" value={locality} disabled={loading || !city} onChange={e => setLocality(e.target.value)}><option value="">All localities</option>{localities.map(place => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
      {select("Property type", "property_type", PROPERTY_TYPES)}
      {numeric("Minimum price (₹)", "min_price", "No minimum")}
      {numeric("Maximum price (₹)", "max_price", "No maximum")}
    </div>
    <p className="text-xs text-slate-500">Prices are listing amounts; check the rental period on property details. Area filters use built-up area in square feet.</p>
    <details open={Boolean(values.min_area || values.max_area || values.bedrooms || values.bathrooms || values.furnishing || values.amenities)} className="rounded-lg border p-3">
      <summary className="cursor-pointer font-medium">More filters</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {numeric("Minimum area (sq ft)", "min_area", "No minimum")}{numeric("Maximum area (sq ft)", "max_area", "No maximum")}
        {select("Bedrooms", "bedrooms", ["1", "2", "3", "4", "5"])}
        {select("Bathrooms", "bathrooms", ["1", "2", "3", "4", "5"])}
        {select("Furnishing", "furnishing", FURNISHING_TYPES)}
      </div>
      <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Amenities — match all selected</legend><div className="flex flex-wrap gap-x-5 gap-y-3">{SEARCH_AMENITIES.map(amenity => <label key={amenity} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="amenities" value={amenity} defaultChecked={(values.amenities || "").split(",").includes(amenity)} />{amenity}</label>)}</div></fieldset>
    </details>
    {(error || rangeError) && <p role="alert" className="text-sm text-red-700">{error || rangeError}</p>}
    <div className="flex flex-wrap items-center gap-3"><button disabled={loading || pending} type="submit" className="btn-primary">{loading ? "Loading locations…" : pending ? "Searching…" : "Apply filters"}</button><a href="/properties" className="rounded-lg border px-4 py-2 text-sm">Clear all</a></div>
  </form></details>;
}
