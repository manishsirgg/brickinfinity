import type { SupabaseClient } from "@supabase/supabase-js";

type Location = { id: string; name: string };
type LookupClient = Pick<SupabaseClient, "from">;

export type LocationFilters = {
  state?: string; city?: string; locality?: string;
  state_id?: string; city_id?: string; locality_id?: string;
};

/** Resolve exact locations in their parent scope; never broaden an unknown location. */
export async function resolvePropertyLocation(client: LookupClient, filters: LocationFilters) {
  let state: Location | null = null;
  let city: Location | null = null;
  let locality: Location | null = null;
  let notFound = false;
  for (const level of ["state", "city", "locality"] as const) {
    const id = filters[`${level}_id`];
    const name = filters[level];
    if (!id && !name) continue;
    const table = { state: "states", city: "cities", locality: "localities" }[level];
    let query = client.from(table).select("id,name");
    query = id ? query.eq("id", id) : query.ilike("name", name!.replace(/[\\%_]/g, "\\$&"));
    if (level === "city" && state) query = query.eq("state_id", state.id);
    if (level === "locality" && city) query = query.eq("city_id", city.id);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Could not resolve ${level}: ${error.message}`);
    if (!data) { notFound = true; break; }
    if (level === "state") state = data;
    if (level === "city") city = data;
    if (level === "locality") locality = data;
  }
  return { state, city, locality, notFound };
}

export function propertyResultsPageHref(filters: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== "page") query.set(key, value);
  });
  query.set("page", String(page));
  return `/properties?${query}`;
}
