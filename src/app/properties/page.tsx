import { createServiceClient } from "@/lib/supabase/service";
import PropertyCard from "@/components/property/PropertyCard";
import { sortFeaturedPropertiesFirst } from "@/lib/property-featured";

const pageSize = 12;

type Props = {
  searchParams?: {
    search?: string;
    propertyType?: string;
    property_type?: string;
    listingType?: string;
    listing_type?: string;
    city?: string;
    state?: string;
    bedrooms?: string;
    minPrice?: string;
    min_price?: string;
    maxPrice?: string;
    max_price?: string;
    page?: string;
  };
};

function cleanString(value?: string) {
  return value?.trim() || undefined;
}

function sanitizeSearchTerm(value?: string) {
  if (!value) return undefined;
  const cleaned = value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || undefined;
}

export default async function PropertiesSearchPage({ searchParams = {} }: Props) {
  const supabase = createServiceClient();
  const rawSearch = cleanString(searchParams.search);
  const keyword = sanitizeSearchTerm(rawSearch);
  const propertyType = cleanString(searchParams.property_type ?? searchParams.propertyType);
  const listingType = cleanString(searchParams.listing_type ?? searchParams.listingType);
  const city = cleanString(searchParams.city);
  const state = cleanString(searchParams.state);
  const bedrooms = cleanString(searchParams.bedrooms);
  const minPrice = Number(cleanString(searchParams.min_price ?? searchParams.minPrice));
  const maxPrice = Number(cleanString(searchParams.max_price ?? searchParams.maxPrice));
  const currentPage = Math.max(1, Number(searchParams.page || "1") || 1);
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("properties")
    .select(
      `id,slug,title,price,listing_type,property_type,bedrooms,bathrooms,built_up_area,amenities,ownership_verified,is_featured,featured_until,featured_rank,featured_plan_key,views_count,created_at,cities(name),localities(name),property_images(image_url)`,
      { count: "exact" }
    )
    .eq("status", "active")
    .eq("verification_status", "approved")
    .is("deleted_at", null);

  let stateId: string | undefined;
  if (state) {
    const { data } = await supabase.from("states").select("id").ilike("name", state).maybeSingle();
    stateId = data?.id;
  }

  let cityId: string | undefined;
  if (city) {
    const { data } = await supabase.from("cities").select("id").ilike("name", city).maybeSingle();
    cityId = data?.id;
  }

  if (listingType === "Sale" || listingType === "Rent") query = query.eq("listing_type", listingType);
  if (propertyType) query = query.eq("property_type", propertyType);
  if (bedrooms && Number.isFinite(Number(bedrooms))) query = query.eq("bedrooms", Number(bedrooms));
  if (Number.isFinite(minPrice) && minPrice > 0) query = query.gte("price", minPrice);
  if (Number.isFinite(maxPrice) && maxPrice > 0) query = query.lte("price", maxPrice);
  if (cityId) query = query.eq("city_id", cityId);
  else if (stateId) query = query.eq("cities.state_id", stateId);
  if (keyword) {
    query = query.or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%,address.ilike.%${keyword}%,location.ilike.%${keyword}%,property_type.ilike.%${keyword}%,listing_type.ilike.%${keyword}%,cities.name.ilike.%${keyword}%,localities.name.ilike.%${keyword}%`);
  }

  const { data, count } = await query
    .order("is_featured", { ascending: false })
    .order("featured_rank", { ascending: false })
    .order("featured_until", { ascending: false })
    .order("views_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const results = data ? sortFeaturedPropertiesFirst(data) : [];

  return (
    <main className="container-custom py-12 md:py-16 space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold">{keyword ? `Search results for “${keyword}”` : "Property Results"}</h1>
        <p className="text-sm text-muted">{count || 0} verified properties found.</p>
      </header>

      {!results.length && (
        <div className="text-center py-20 border rounded-xl bg-white">
          <p className="text-muted">No properties found for your search. Try another city, location, or property type.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {results.map((property: any) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </main>
  );
}
