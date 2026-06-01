import { createServiceClient } from "@/lib/supabase/service";
import PropertyCard from "@/components/property/PropertyCard";
import { sortFeaturedPropertiesFirst } from "@/lib/property-featured";
import {
  getListingTypeSearchIntent,
  getPropertyTypeSearchIntent,
  getSearchAliases,
  normalizeSearchTerm,
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

type Props = {
  searchParams?: PropertiesSearchParams | Promise<PropertiesSearchParams>;
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

function toSupabasePattern(value: string) {
  return value
    .replace(/[,%()]/g, " ")
    .replace(/[%_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type LocationSearchIds = {
  cityIds: string[];
  localityIds: string[];
};

function buildKeywordOr(terms: string[], locationIds: LocationSearchIds) {
  const conditions = terms.flatMap((term) => {
    const pattern = toSupabasePattern(term);
    if (!pattern) return [];

    return [
      `title.ilike.%${pattern}%`,
      `description.ilike.%${pattern}%`,
      `address.ilike.%${pattern}%`,
      `location.ilike.%${pattern}%`,
      `slug.ilike.%${pattern}%`,
      `property_type.ilike.%${pattern}%`,
      `listing_type.ilike.%${pattern}%`,
    ];
  });

  if (locationIds.cityIds.length) {
    conditions.push(`city_id.in.(${locationIds.cityIds.join(",")})`);
  }

  if (locationIds.localityIds.length) {
    conditions.push(`locality_id.in.(${locationIds.localityIds.join(",")})`);
  }

  return Array.from(new Set(conditions)).join(",");
}

async function getKeywordLocationIds(
  supabase: ReturnType<typeof createServiceClient>,
  terms: string[],
): Promise<LocationSearchIds> {
  const cityIds = new Set<string>();
  const localityIds = new Set<string>();
  const locationOr = buildLocationNameOr(terms);

  if (!locationOr) return { cityIds: [], localityIds: [] };

  const [{ data: cities }, { data: localities }, { data: states }] = await Promise.all([
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
    states?.map((state: { id?: string | null }) => state.id).filter(Boolean) ?? [];

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

function buildLocationNameOr(terms: string[]) {
  const conditions = terms.flatMap((term) => {
    const pattern = toSupabasePattern(term);
    return pattern ? [`name.ilike.%${pattern}%`] : [];
  });

  return Array.from(new Set(conditions)).join(",");
}

export default async function PropertiesSearchPage({
  searchParams = {},
}: Props) {
  const supabase = createServiceClient();
  const resolvedSearchParams = await searchParams;
  const rawSearch = cleanString(resolvedSearchParams.search);
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
  const bedrooms = cleanString(resolvedSearchParams.bedrooms);
  const minPrice = Number(
    cleanString(
      resolvedSearchParams.min_price ?? resolvedSearchParams.minPrice,
    ),
  );
  const maxPrice = Number(
    cleanString(
      resolvedSearchParams.max_price ?? resolvedSearchParams.maxPrice,
    ),
  );
  const propertyTypeDisplayName = getPropertyTypeDisplayName(propertyType);
  const currentPage = Math.max(
    1,
    Number(resolvedSearchParams.page || "1") || 1,
  );
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("properties")
    .select(
      `id,slug,title,price,listing_type,property_type,bedrooms,bathrooms,built_up_area,amenities,ownership_verified,is_featured,featured_until,featured_rank,featured_plan_key,views_count,created_at,cities(name),localities(name),property_images(image_url)`,
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("verification_status", "approved")
    .is("deleted_at", null);

  let stateId: string | undefined;
  if (state) {
    const { data } = await supabase
      .from("states")
      .select("id")
      .ilike("name", state)
      .maybeSingle();
    stateId = data?.id;
  }

  let cityId: string | undefined;
  if (city) {
    const { data } = await supabase
      .from("cities")
      .select("id")
      .ilike("name", city)
      .maybeSingle();
    cityId = data?.id;
  }

  if (listingType === "Sale" || listingType === "Rent")
    query = query.eq("listing_type", listingType);

  if (propertyType) query = query.eq("property_type", propertyType);
  if (bedrooms && Number.isFinite(Number(bedrooms)))
    query = query.eq("bedrooms", Number(bedrooms));
  if (Number.isFinite(minPrice) && minPrice > 0)
    query = query.gte("price", minPrice);
  if (Number.isFinite(maxPrice) && maxPrice > 0)
    query = query.lte("price", maxPrice);
  if (cityId) query = query.eq("city_id", cityId);
  else if (stateId) query = query.eq("cities.state_id", stateId);
  if (keyword) {
    const keywordOr = buildKeywordOr(keywordTerms, keywordLocationIds);

    if (process.env.NODE_ENV === "development") {
      console.debug("[properties-search]", {
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
          minPrice: Number.isFinite(minPrice) && minPrice > 0 ? minPrice : null,
          maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : null,
        },
        keywordLocationIds,
        keywordOr,
      });
    }

    if (keywordOr) query = query.or(keywordOr);
  }

  const { data, count } = await query
    .order("is_featured", { ascending: false })
    .order("featured_rank", { ascending: false })
    .order("featured_until", { ascending: false })
    .order("views_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const results = data ? sortFeaturedPropertiesFirst(data) : [];
  const totalMatches = count ?? results.length;
  const showNoResultSuggestions = totalMatches === 0;
  const pageHeading = keyword
    ? `Search results for “${keyword}”`
    : propertyTypeDisplayName
      ? `${propertyTypeDisplayName} Properties`
      : "Property Results";
  const activeSearchChips = [
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

      {!results.length && (
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
    </main>
  );
}
