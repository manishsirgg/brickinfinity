import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePropertyLocation } from "@/lib/property-location";
import { buildLocationNameOr, getSearchAliases, normalizeSearchTerm } from "@/lib/property-search";
import { SEARCH_AMENITIES, PROPERTY_TYPES, FURNISHING_TYPES } from "@/lib/property-result-options";

export type SearchCriteria = Record<string, string | number | string[]>;
const keys = ["search", "listing_type", "property_type", "state_id", "city_id", "locality_id", "min_price", "max_price", "min_area", "max_area", "bedrooms", "bathrooms", "furnishing", "amenities", "availability", "confirmed_recent"];
export function normalizeSavedFilters(input: Record<string, unknown>) {
  const values: Record<string, string> = {};
  const alias: Record<string, string> = { property_type: "propertyType", listing_type: "listingType", min_price: "minPrice", max_price: "maxPrice", search: "keyword" };
  for (const key of keys) {
    const raw = input[key] ?? input[alias[key]];
    if (raw == null || raw === "") continue;
    if (Array.isArray(raw)) { if (key !== "amenities" || raw.some(v => typeof v !== "string")) throw Error("Invalid search filters."); values[key] = raw.join(","); }
    else if (typeof raw === "string") values[key] = raw.trim();
    else throw Error("Invalid search filters.");
  }
  return values;
}
export async function compileSavedSearch(db: SupabaseClient, input: Record<string, unknown>) {
  const values = normalizeSavedFilters(input);
  const criteria: SearchCriteria = {};
  for (const [key, options] of [["listing_type", ["Rent", "Sale"]], ["property_type", PROPERTY_TYPES], ["furnishing", FURNISHING_TYPES], ["availability", ["available", "available_from"]], ["confirmed_recent", ["1"]]] as const) {
    if (values[key]) { if (!(options as readonly string[]).includes(values[key])) throw Error(`Choose a valid ${key.replaceAll("_", " ")}.`); criteria[key] = values[key]; }
  }
  for (const key of ["min_price", "max_price", "min_area", "max_area", "bedrooms", "bathrooms"]) {
    if (!values[key]) continue;
    const value = Number(values[key]);
    if (!Number.isFinite(value) || value < 0 || value > 1e12 || (["bedrooms", "bathrooms"].includes(key) && (!Number.isInteger(value) || value < 1 || value > 5))) throw Error("Enter valid price, area and room filters.");
    criteria[key] = value; values[key] = String(value);
  }
  for (const key of ["price", "area"]) if (criteria[`min_${key}`] != null && criteria[`max_${key}`] != null && Number(criteria[`min_${key}`]) > Number(criteria[`max_${key}`])) throw Error(`Minimum ${key} cannot exceed maximum ${key}.`);
  const location = await resolvePropertyLocation(db, { ...values,
    state: typeof input.state === "string" ? input.state : undefined,
    city: typeof input.city === "string" ? input.city : undefined,
    locality: typeof input.locality === "string" ? input.locality : undefined,
  });
  if (location.notFound) throw Error("Select a recognised location before saving this search.");
  for (const level of ["state", "city", "locality"] as const) if (location[level]) criteria[`${level}_id`] = values[`${level}_id`] = location[level]!.id;
  if (values.amenities) {
    const amenities = [...new Set(values.amenities.split(",").map(v => v.trim()).filter(Boolean))].sort();
    if (amenities.some(v => !SEARCH_AMENITIES.includes(v))) throw Error("Choose valid amenities.");
    if (amenities.length) { criteria.amenities = amenities; values.amenities = amenities.join(","); }
  }
  if (values.search) {
    const keyword = values.search.replace(/[,%()]/g, " ").replace(/[%_]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    values.search = keyword;
    const terms = !keyword ? [] : normalizeSearchTerm(keyword) ? getSearchAliases(keyword) : [keyword];
    if (terms.length) criteria.terms = terms;
    const or = buildLocationNameOr(terms);
    if (or) {
      const [{ data: cities, error: ce }, { data: localities, error: le }, { data: states, error: se }] = await Promise.all([
        db.from("cities").select("id").or(or).limit(100), db.from("localities").select("id").or(or).limit(100), db.from("states").select("id").or(or).limit(50),
      ]);
      if (ce || le || se) throw Error("Search locations could not be resolved. Try again.");
      const cityIds = new Set<string>((cities || []).map(c => c.id));
      if (states?.length) {
        const { data, error } = await db.from("cities").select("id").in("state_id", states.map(s => s.id)).limit(200);
        if (error) throw Error("Search locations could not be resolved.");
        data?.forEach(c => cityIds.add(c.id));
      }
      criteria.keyword_city_ids = [...cityIds].sort(); criteria.keyword_locality_ids = (localities || []).map(l => l.id).sort();
    }
  }
  if (!Object.keys(criteria).length) throw Error("Apply at least one search filter before saving.");
  const locationNames = [location.locality?.name, location.city?.name, location.state?.name].filter(Boolean);
  const summary = [criteria.property_type, criteria.listing_type, locationNames.join(", "), criteria.max_price != null ? `up to ₹${Number(criteria.max_price).toLocaleString("en-IN")}` : "", criteria.min_area != null ? `at least ${criteria.min_area} sqft` : "", values.search].filter(Boolean).join(" · ").slice(0, 200);
  return { criteria, values, summary: summary || "My property search" };
}
