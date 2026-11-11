import PropertySearchFilters from "@/components/property/PropertySearchFilters";
import { propertySortOrder, parsePropertySort, SEARCH_AMENITIES, FURNISHING_TYPES, PROPERTY_TYPES, PROPERTY_SORTS } from "@/lib/property-result-options";
import { resolvePropertyLocation, propertyResultsPageHref } from "@/lib/property-location";
import { createServiceClient } from "@/lib/supabase/service";
import PropertyCard from "@/components/property/PropertyCard";
import {
  buildLocationNameOr,
  buildPropertyKeywordOr,
  getListingTypeSearchIntent,
  getPropertyTypeSearchIntent,
  getSearchAliases,
  normalizeSearchTerm,
  type PropertySearchLocationIds,
} from "@/lib/property-search";
import Link from "next/link";

const pageSize = 12;
const suggestionLinkClass =
  "rounded-full border border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2";

const noResultSuggestions = [
  {
    label: "View Commercial Spaces",
    href: {
      pathname: "/properties",
      query: { property_type: "Commercial" },
    },
  },
  {
    label: "View Rent Properties",
    href: "/properties/rent",
  },
  {
    label: "View Buy Properties",
    href: "/properties/buy",
  },
  {
    label: "View Latest Listings",
    href: "/properties/latest",
  },
];

type PropertiesSearchParams = {
  search?: string;
  keyword?: string;
  sort?: string;
  min_area?: string;
  max_area?: string;
  bathrooms?: string;
  furnishing?: string;
  amenities?: string;
  propertyType?: string;
  property_type?: string;
  listingType?: string;
  listing_type?: string;
  city?: string;
  state?: string;
  locality?: string;
  state_id?: string;
  city_id?: string;
  locality_id?: string;
  bedrooms?: string;
  minPrice?: string;
  min_price?: string;
  maxPrice?: string;
  max_price?: string;
  page?: string;
};

type Props = {
  searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
};

function cleanString(value?: string) {
  return value?.trim() || undefined;
}

function getPropertyTypeDisplayName(value?: string) {
  if (!value) return undefined;
  if (value === "Commercial") return "Commercial Space";
  return value;
}

function sanitizeSearchTerm(value?: string) {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[,%()]/g, " ")
    .replace(/[%_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || undefined;
}

async function getKeywordLocationIds(
  supabase: ReturnType<typeof createServiceClient>,
  terms: string[],
): Promise<PropertySearchLocationIds> {
  const cityIds = new Set<string>();
  const localityIds = new Set<string>();
  const locationOr = buildLocationNameOr(terms);

  if (!locationOr) return { cityIds: [], localityIds: [] };

  const [{ data: cities }, { data: localities }, { data: states }] =
    await Promise.all([
      supabase.from("cities").select("id").or(locationOr).limit(100),
      supabase.from("localities").select("id").or(locationOr).limit(100),
      supabase.from("states").select("id").or(locationOr).limit(50),
    ]);

  cities?.forEach((city: { id?: string | null }) => {
    if (city.id) cityIds.add(city.id);
  });

  localities?.forEach((locality: { id?: string | null }) => {
    if (locality.id) localityIds.add(locality.id);
  });

  const stateIds =
    states?.map((state: { id?: string | null }) => state.id).filter(Boolean) ??
    [];

  if (stateIds.length) {
    const { data: stateCities } = await supabase
      .from("cities")
      .select("id")
      .in("state_id", stateIds)
      .limit(200);

    stateCities?.forEach((city: { id?: string | null }) => {
      if (city.id) cityIds.add(city.id);
    });
  }

  return {
    cityIds: Array.from(cityIds),
    localityIds: Array.from(localityIds),
  };
}

export default async function PropertiesSearchPage({
  searchParams = {},
}: Props) {
  const supabase = createServiceClient();
  const incoming = await searchParams;
  const resolvedSearchParams = Object.fromEntries(Object.entries(incoming).map(([key, value]) => [key, Array.isArray(value) ? key === "amenities" ? value.join(",") : value[0] : value])) as PropertiesSearchParams;
  let filterError = "";
  const readNumber = (key: keyof PropertiesSearchParams) => {
    const raw = cleanString(resolvedSearchParams[key]);
    if (!raw) return undefined;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) { filterError = "Enter valid non-negative numbers for price, area and room filters."; return undefined; }
    return number;
  };
  const rawSearch = cleanString(resolvedSearchParams.search || resolvedSearchParams.keyword);
  const keyword = sanitizeSearchTerm(rawSearch);
  const normalizedSearch = normalizeSearchTerm(keyword || "");
  const propertyType = cleanString(
    resolvedSearchParams.property_type ?? resolvedSearchParams.propertyType,
  );
  const listingType = cleanString(
    resolvedSearchParams.listing_type ?? resolvedSearchParams.listingType,
  );
  const propertyTypeIntent = keyword
    ? getPropertyTypeSearchIntent(keyword)
    : null;
  const listingTypeIntent = keyword
    ? getListingTypeSearchIntent(keyword)
    : null;
  const inferredPropertyType = !propertyType ? propertyTypeIntent : null;
  const inferredListingType = !listingType ? listingTypeIntent : null;
  const keywordTerms = keyword
    ? normalizedSearch
      ? getSearchAliases(keyword)
      : [keyword]
    : [];
  const keywordLocationIds = keyword
    ? await getKeywordLocationIds(supabase, keywordTerms)
    : { cityIds: [], localityIds: [] };
  const city = cleanString(resolvedSearchParams.city);
  const state = cleanString(resolvedSearchParams.state);
  const location = await resolvePropertyLocation(supabase, {
    state, city, locality: cleanString(resolvedSearchParams.locality),
    state_id: cleanString(resolvedSearchParams.state_id),
    city_id: cleanString(resolvedSearchParams.city_id),
    locality_id: cleanString(resolvedSearchParams.locality_id),
  }).catch(() => { filterError = "The selected location could not be loaded. Please choose it again."; return { state: null, city: null, locality: null, notFound: true }; });
  const locationLabel = location.locality?.name || location.city?.name || location.state?.name;
  const bedrooms = cleanString(resolvedSearchParams.bedrooms);
  const minPrice = readNumber(resolvedSearchParams.min_price !== undefined ? "min_price" : "minPrice");
  const maxPrice = readNumber(resolvedSearchParams.max_price !== undefined ? "max_price" : "maxPrice");
  const minArea = readNumber("min_area");
  const maxArea = readNumber("max_area");
  const bathrooms = readNumber("bathrooms");
  const bedroomCount = readNumber("bedrooms");
  const furnishing = cleanString(resolvedSearchParams.furnishing);
  const amenities = [...new Set((resolvedSearchParams.amenities || "").split(",").map(value => value.trim()).filter(Boolean))];
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) filterError = "Minimum price cannot exceed maximum price.";
  if (minArea !== undefined && maxArea !== undefined && minArea > maxArea) filterError = "Minimum area cannot exceed maximum area.";
  if (propertyType && !PROPERTY_TYPES.includes(propertyType)) filterError = "Choose a valid property type.";
  if (listingType && !["Sale", "Rent"].includes(listingType)) filterError = "Choose Sale or Rent.";
  if (furnishing && !FURNISHING_TYPES.includes(furnishing)) filterError = "Choose a valid furnishing option.";
  if (amenities.some(amenity => !SEARCH_AMENITIES.includes(amenity))) filterError = "Choose valid amenities.";
  if ([bedroomCount, bathrooms].some(value => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5))) filterError = "Choose a room count from 1 to 5.";
  const sort = parsePropertySort(resolvedSearchParams.sort);
  const sortOrder = propertySortOrder(sort);
  let formCityId = location.city?.id || "";
  if (!formCityId && location.locality) {
    const { data } = await supabase.from("localities").select("city_id").eq("id", location.locality.id).maybeSingle();
    formCityId = data?.city_id || "";
  }
  let formStateId = location.state?.id || "";
  if (!formStateId && formCityId) {
    const { data } = await supabase.from("cities").select("state_id").eq("id", formCityId).maybeSingle();
    formStateId = data?.state_id || "";
  }
  const [{ data: states }, { data: cities }, { data: localities }] = await Promise.all([
    supabase.from("states").select("id,name").order("name"),
    formStateId ? supabase.from("cities").select("id,name").eq("state_id", formStateId).order("name") : Promise.resolve({ data: [] }),
    formCityId ? supabase.from("localities").select("id,name").eq("city_id", formCityId).order("name") : Promise.resolve({ data: [] }),
  ]);
  const propertyTypeDisplayName = getPropertyTypeDisplayName(propertyType);
  const requestedPage = Number(resolvedSearchParams.page || "1");
  const currentPage = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("properties")
    .select(
      `id,slug,title,price,listing_type,property_type,bedrooms,bathrooms,built_up_area,amenities,ownership_verified,is_featured,featured_until,featured_rank,featured_plan_key,views_count,created_at,${location.state ? "cities!inner(name)" : "cities(name)"},localities(name),property_images(image_url,sort_order)`,
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("verification_status", "approved")
    .is("deleted_at", null);

  if (listingType === "Sale" || listingType === "Rent")
    query = query.eq("listing_type", listingType);

  if (propertyType) query = query.eq("property_type", propertyType);
  if (bedroomCount !== undefined) query = query.eq("bedrooms", bedroomCount);
  if (bathrooms !== undefined) query = query.eq("bathrooms", bathrooms);
  if (minPrice !== undefined) query = query.gte("price", minPrice);
  if (maxPrice !== undefined) query = query.lte("price", maxPrice);
  if (minArea !== undefined) query = query.gte("built_up_area", minArea);
  if (maxArea !== undefined) query = query.lte("built_up_area", maxArea);
  if (furnishing) query = query.eq("furnishing_status", furnishing);
  if (amenities.length) query = query.contains("amenities", amenities);
  if (filterError) query = query.in("id", []);
  if (location.notFound) query = query.in("id", []);
  if (location.state) query = query.eq("cities.state_id", location.state.id);
  if (location.city) query = query.eq("city_id", location.city.id);
  if (location.locality) query = query.eq("locality_id", location.locality.id);
  if (keyword) {
    const keywordOr = buildPropertyKeywordOr(keywordTerms, keywordLocationIds);

    if (process.env.NODE_ENV === "development") {
      console.debug("[properties-search-debug]", {
        normalizedSearch,
        propertyTypeIntent: propertyTypeIntent?.key ?? null,
        listingTypeIntent: listingTypeIntent?.key ?? null,
        aliases: keywordTerms,
        explicitFilters: {
          propertyType: propertyType ?? null,
          listingType: listingType ?? null,
          city: city ?? null,
          state: state ?? null,
          bedrooms: bedrooms ?? null,
          minPrice: minPrice ?? null,
          maxPrice: maxPrice ?? null,
        },
        keywordLocationIds,
        keywordOr,
      });
    }

    if (keywordOr) query = query.or(keywordOr);
  }

  const { data, count, error } = await query
    .order(sortOrder.column, { ascending: sortOrder.ascending, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("Properties search query error:", error);
  }

  const results = data || [];
  const totalMatches = count ?? results.length;
  const showNoResultSuggestions = !error && !filterError && totalMatches === 0;
  const pageHeading = keyword
    ? `Search results for “${keyword}”`
    : propertyTypeDisplayName
      ? `${propertyTypeDisplayName} Properties`
      : locationLabel ? `Properties in ${locationLabel}` : listingType === "Sale" ? "Properties for sale" : listingType === "Rent" ? "Properties for rent" : "Property Results";
  const activeSearchChips = [
    minPrice !== undefined || maxPrice !== undefined ? { label: "Price", value: `₹${minPrice ?? 0} – ${maxPrice !== undefined ? `₹${maxPrice}` : "Any"}` } : null,
    minArea !== undefined || maxArea !== undefined ? { label: "Built-up area", value: `${minArea ?? 0} – ${maxArea ?? "Any"} sq ft` } : null,
    bedroomCount ? { label: "Bedrooms", value: String(bedroomCount) } : null,
    bathrooms ? { label: "Bathrooms", value: String(bathrooms) } : null,
    furnishing ? { label: "Furnishing", value: furnishing } : null,
    ...amenities.map(value => ({ label: "Amenity", value })),
    location.state ? { label: "State", value: location.state.name } : null,
    location.city ? { label: "City", value: location.city.name } : null,
    location.locality ? { label: "Locality", value: location.locality.name } : null,
    keyword ? { label: "Search", value: keyword } : null,
    propertyTypeDisplayName
      ? { label: "Property type", value: propertyTypeDisplayName }
      : null,
    listingType ? { label: "Listing type", value: listingType } : null,
    inferredPropertyType
      ? { label: "Matched as", value: inferredPropertyType.label }
      : null,
    inferredListingType
      ? { label: "Matched as", value: inferredListingType.label }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <main className="container-custom py-12 md:py-16 space-y-10">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold">{pageHeading}</h1>
          <p className="text-sm text-muted">
            {totalMatches} verified properties found.
          </p>
        </div>

        {activeSearchChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeSearchChips.map((chip) => (
              <span
                key={`${chip.label}-${chip.value}`}
                className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
              >
                {chip.label}: {chip.value}
              </span>
            ))}
          </div>
        )}
      </header>

      <PropertySearchFilters key={JSON.stringify(resolvedSearchParams)} states={states || []} cities={cities || []} localities={localities || []} values={{ ...resolvedSearchParams, search: rawSearch, state_id: formStateId, city_id: formCityId, locality_id: location.locality?.id, listing_type: listingType, property_type: propertyType, min_price: resolvedSearchParams.min_price ?? resolvedSearchParams.minPrice, max_price: resolvedSearchParams.max_price ?? resolvedSearchParams.maxPrice, sort }} />
      <p className="text-sm text-slate-500">Sorted by {PROPERTY_SORTS[sort].toLowerCase()}. Featured listings are labeled; your selected sort order is preserved.</p>
      {(filterError || error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{filterError || "Properties could not be loaded. Please try again."}</p>}
      {!results.length && !error && !filterError && (
        <div className="text-center py-16 px-6 border rounded-xl bg-white space-y-5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {showNoResultSuggestions
                ? keyword
                  ? `No matching properties found for “${keyword}”.`
                  : "No properties found."
                : "No properties found on this page."}
            </h2>
            <p className="text-muted">
              {showNoResultSuggestions
                ? "Try a different property type, listing type, city, or locality."
                : "Try returning to the first page or adjusting your filters."}
            </p>
          </div>
          {showNoResultSuggestions && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {noResultSuggestions.map((suggestion) => (
                <Link
                  key={suggestion.label}
                  className={suggestionLinkClass}
                  href={suggestion.href}
                >
                  {suggestion.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
        {results.map((property: any) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
      {totalMatches > pageSize && (
        <nav aria-label="Property results pages" className="flex items-center justify-center gap-4">
          {currentPage > 1 && <Link href={propertyResultsPageHref(resolvedSearchParams, currentPage - 1)} className="rounded-lg border px-4 py-2">Previous</Link>}
          <span>Page {currentPage} of {Math.ceil(totalMatches / pageSize)}</span>
          {currentPage * pageSize < totalMatches && <Link href={propertyResultsPageHref(resolvedSearchParams, currentPage + 1)} className="rounded-lg border px-4 py-2">Next</Link>}
        </nav>
      )}
    </main>
  );
}
