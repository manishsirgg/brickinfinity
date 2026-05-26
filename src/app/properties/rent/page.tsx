import { createServiceClient } from "@/lib/supabase/service";
import PropertyCard from "@/components/property/PropertyCard";
import Link from "next/link";
import { isPropertyFeaturedActive, sortFeaturedPropertiesFirst } from "@/lib/property-featured";

const pageSize = 9;
type Props = { searchParams?: { page?: string } };

function toPage(value?: string) {
  const n = Number(value || "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export default async function PropertiesRentPage({ searchParams = {} }: Props) {
  const currentPage = toPage(searchParams.page);
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("properties")
    .select(`id,slug,price,listing_type,property_type,bedrooms,bathrooms,built_up_area,amenities,created_at,views_count,ownership_verified,is_featured,featured_until,featured_rank,featured_plan_key,cities(name),localities(name),property_images(image_url)`)
    .eq("listing_type", "Rent")
    .eq("status", "active")
    .eq("verification_status", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) console.error("Properties rent page error:", error);

  const allRent = data || [];
  const featuredRent = sortFeaturedPropertiesFirst(allRent.filter((property: any) => isPropertyFeaturedActive(property)));
  const featuredIds = new Set(featuredRent.map((p: any) => p.id));
  const normalRent = allRent.filter((property: any) => !featuredIds.has(property.id));

  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize;
  const paged = normalRent.slice(from, to);
  const totalPages = Math.max(1, Math.ceil(normalRent.length / pageSize));

  return (
    <main className="container-custom py-12 md:py-16 space-y-12">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold">Properties for Rent</h1>
        <p className="text-sm text-muted">{allRent.length} verified rent properties available.</p>
      </div>

      {featuredRent.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-xl md:text-2xl font-semibold">Featured Rent Properties</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
            {featuredRent.map((property: any) => <PropertyCard key={property.id} property={property} />)}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <h2 className="text-xl md:text-2xl font-semibold">Latest Rent Listings</h2>
        {!paged.length && <div className="text-center py-20 border border-border rounded-xl text-muted">No rent properties available right now.</div>}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
          {paged.map((property: any) => <PropertyCard key={property.id} property={property} />)}
        </div>
      </section>

      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-3 pt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <Link key={i} href={`/properties/rent?page=${i + 1}`} className={`px-4 py-2 rounded-md text-sm border transition ${currentPage === i + 1 ? "bg-primary text-white border-primary" : "border-border hover:bg-surface"}`}>
              {i + 1}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
