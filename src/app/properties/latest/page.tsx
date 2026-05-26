import { createServiceClient } from "@/lib/supabase/service";
import PropertyCard from "@/components/property/PropertyCard";
import Link from "next/link";

const pageSize = 9;

type Props = { searchParams?: { page?: string } };

function toPage(value?: string) {
  const n = Number(value || "1");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export default async function LatestPropertiesPage({ searchParams = {} }: Props) {
  const currentPage = toPage(searchParams.page);
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = createServiceClient();

  const { data, count, error } = await supabase
    .from("properties")
    .select(`id,slug,price,listing_type,property_type,bedrooms,bathrooms,built_up_area,amenities,created_at,views_count,ownership_verified,is_featured,featured_until,featured_rank,featured_plan_key,cities(name),localities(name),property_images(image_url)`, { count: "exact" })
    .eq("status", "active")
    .eq("verification_status", "approved")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) console.error("Latest properties page error:", error);
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));

  return (
    <main className="container-custom py-12 md:py-16 space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold">Latest Listings</h1>
        <p className="text-sm text-muted">{count || 0} active approved listings sorted by newest first.</p>
      </div>
      {!data?.length && <div className="text-center py-20 border border-border rounded-xl text-muted">No properties available right now.</div>}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 md:gap-8">
        {data?.map((property: any) => <PropertyCard key={property.id} property={property} />)}
      </div>
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center gap-3 pt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <Link key={i} href={`/properties/latest?page=${i + 1}`} className={`px-4 py-2 rounded-md text-sm border transition ${currentPage === i + 1 ? "bg-primary text-white border-primary" : "border-border hover:bg-surface"}`}>
              {i + 1}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
