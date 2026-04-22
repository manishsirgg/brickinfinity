import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Metadata } from "next";
import PropertyCard from "@/components/property/PropertyCard";

type Props = {
  searchParams?: {
    state?: string;
    city?: string;
    keyword?: string;
    minPrice?: string;
    maxPrice?: string;
    propertyType?: string;
    bedrooms?: string;
    amenities?: string;
    page?: string;
  };
};

const pageSize = 9;

function toNumber(value?: string) {
  if (value === undefined) return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const num = Number(trimmed);
  return isNaN(num) ? undefined : num;
}

function cleanString(value?: string) {
  return value?.trim() || undefined;
}

function sanitizeSearchTerm(value?: string) {
  if (!value) return undefined;

  const cleaned = value
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || undefined;
}

/* ================= SEO ================= */

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {

  const state = cleanString(searchParams?.state);
  const city = cleanString(searchParams?.city);
  const propertyType = cleanString(searchParams?.propertyType);

  const titleParts = ["Buy Properties"];

  if (propertyType) titleParts.push(propertyType);
  if (city) titleParts.push(`in ${city}`);
  else if (state) titleParts.push(`in ${state}`);

  return {
    title: `${titleParts.join(" ")} | BrickInfinity`,
    description:
      "Browse verified properties for sale with advanced filtering and trusted listings.",
    alternates: {
      canonical: "/buy",
    },
  };
}

/* ================= PAGE ================= */

export default async function BuyPage({
  searchParams = {},
}: Props) {

  const supabase = await createClient();

  const state = cleanString(searchParams.state);
  const city = cleanString(searchParams.city);
  const keyword = sanitizeSearchTerm(cleanString(searchParams.keyword));

  const minPrice = toNumber(searchParams.minPrice);
  const maxPrice = toNumber(searchParams.maxPrice);
  const propertyType = cleanString(searchParams.propertyType);
  const bedrooms = toNumber(searchParams.bedrooms);
  const amenities = cleanString(searchParams.amenities);

  const currentPage = Math.max(
    1,
    toNumber(searchParams.page) || 1
  );

  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;

  /* ================= STATE RESOLVE ================= */

  let stateId: string | undefined;

  if (state) {
    const { data } = await supabase
      .from("states")
      .select("id")
      .ilike("name", state)
      .maybeSingle();

    stateId = data?.id;
  }

  /* ================= CITY RESOLVE ================= */

  let cityId: string | undefined;

  if (city) {
    const { data } = await supabase
      .from("cities")
      .select("id")
      .ilike("name", city)
      .maybeSingle();

    cityId = data?.id;
  }

  /* ================= QUERY ================= */

  let query = supabase
    .from("properties")
    .select(
      `
      id,
      slug,
      price,
      listing_type,
      property_type,
      bedrooms,
      bathrooms,
      built_up_area,
      amenities,
      ownership_verified,
      is_featured,
      views_count,
      created_at,
      cities(name,state_id),
      localities(name),
      property_images(image_url)
      `,
      { count: "exact" }
    )
    .eq("listing_type", "Sale")
    .is("deleted_at", null);

  /* ===== GLOBAL KEYWORD SEARCH ===== */

  if (keyword) {
    query = query.or(`
      property_type.ilike.%${keyword}%,
      cities.name.ilike.%${keyword}%,
      localities.name.ilike.%${keyword}%
    `);
  }

  /* ===== LOCATION FILTER ===== */

  if (cityId) {
    query = query.eq("city_id", cityId);
  } else if (stateId) {
    query = query.eq("cities.state_id", stateId);
  }

  /* ===== OTHER FILTERS ===== */

  if (minPrice !== undefined) query = query.gte("price", minPrice);
  if (maxPrice !== undefined) query = query.lte("price", maxPrice);
  if (propertyType)
    query = query.eq("property_type", propertyType);
  if (bedrooms !== undefined)
    query = query.eq("bedrooms", bedrooms);
  if (amenities)
    query = query.contains("amenities", [amenities]);

  query = query
    .order("is_featured", { ascending: false })
    .order("views_count", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data: properties, count, error } =
    await query;

  if (error) {
    console.error("Buy page error:", error);
  }

  const totalPages = count
    ? Math.ceil(count / pageSize)
    : 1;

  function buildPageUrl(pageNumber: number) {
    const params = new URLSearchParams({
      ...searchParams,
      page: pageNumber.toString(),
    });

    return `/buy?${params.toString()}`;
  }

  /* ================= UI ================= */

  return (
    <main className="container-custom py-12 md:py-16 space-y-12">

      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold">
          Buy Properties
        </h1>

        <p className="text-sm text-muted">
          {count || 0} verified properties for sale.
        </p>
      </div>

      {!properties?.length && (
        <div className="text-center py-20 border border-border rounded-xl">
          <p className="text-muted">
            No properties found matching your filters.
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
        {properties?.map((property: any) => (
          <PropertyCard
            key={property.id}
            property={property}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-3 pt-8">
          {Array.from({ length: totalPages }).map(
            (_, i) => (
              <Link
                key={i}
                href={buildPageUrl(i + 1)}
                className={`px-4 py-2 rounded-md text-sm border transition ${
                  currentPage === i + 1
                    ? "bg-primary text-white border-primary"
                    : "border-border hover:bg-surface"
                }`}
              >
                {i + 1}
              </Link>
            )
          )}
        </div>
      )}

    </main>
  );
}
