import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Button from "@/components/ui/Button";
import HeroSearch from "@/components/HeroSearch";
import PropertyCard from "@/components/property/PropertyCard";

export default async function HomePage() {

  const supabase = await createClient();

  async function fetchHomeProperties(orderBy: "views_count" | "created_at") {
    const baseSelect = `
      id,
      slug,
      price,
      listing_type,
      property_type,
      bedrooms,
      bathrooms,
      built_up_area,
      amenities,
      created_at,
      views_count,
      is_featured,
      ownership_verified,
      cities(name),
      localities(name),
      property_images(image_url)
    `;

    const richQuery = supabase
      .from("properties")
      .select(baseSelect)
      .is("deleted_at", null)
      .order(orderBy, { ascending: false })
      .limit(4);

    const { data, error } = await richQuery;
    if (!error) return data;

    console.error(`Home ${orderBy} query error:`, error);

    const { data: fallback, error: fallbackError } = await supabase
      .from("properties")
      .select(`
        id,
        slug,
        price,
        listing_type,
        property_type,
        bedrooms,
        bathrooms,
        built_up_area,
        amenities,
        created_at,
        views_count,
        is_featured,
        ownership_verified
      `)
      .is("deleted_at", null)
      .order(orderBy, { ascending: false })
      .limit(4);

    if (fallbackError) {
      console.error(`Home ${orderBy} fallback error:`, fallbackError);
      return null;
    }

    return fallback;
  }

  /* ================= FEATURED ================= */

  const featured = await fetchHomeProperties("views_count");

  /* ================= LATEST ================= */

  const latest = await fetchHomeProperties("created_at");

  return (
    <main className="bg-[#F7F8FA]">

      {/* HERO */}

      <section className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">

          <div className="space-y-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] text-[var(--color-dark)]">
              Verified Real Estate
              <span className="block text-[var(--color-primary)] mt-2">
                Built for Scale & Trust
              </span>
            </h1>

            <p className="text-base md:text-lg text-[var(--color-muted)] leading-relaxed max-w-xl">
              BrickInfinity connects buyers and sellers through a secure,
              verification-driven real estate marketplace across India.
            </p>

            <div className="pt-6 max-w-3xl">
              <HeroSearch />
            </div>

            <div className="flex gap-4 flex-wrap">
              <Button href="/buy">
                Explore Properties
              </Button>

              <Button
                href="/dashboard/add-property"
                variant="secondary"
              >
                List Property
              </Button>
            </div>

          </div>

          <div className="hidden md:flex justify-center relative">
            <div className="w-96 h-96 bg-gradient-to-br from-red-500 via-orange-400 to-red-600 rounded-full opacity-10 blur-3xl" />
          </div>

        </div>
      </section>

      {/* FEATURED */}

      <section className="bg-white py-20 border-t">
        <div className="max-w-7xl mx-auto px-6">

          <SectionHeader
            title="Featured Properties"
            subtitle="Top-performing verified listings."
            href="/buy"
            linkText="View All →"
          />

          <PropertyGrid properties={featured} />

        </div>
      </section>

      {/* LATEST */}

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6">

          <SectionHeader
            title="Latest Listings"
            subtitle="Recently added verified homes."
            href="/buy"
            linkText="Browse More →"
          />

          <PropertyGrid properties={latest} />

        </div>
      </section>

      {/* TRUST */}

      <section className="bg-white border-t py-20">
        <div className="max-w-6xl mx-auto px-6 text-center">

          <h2 className="text-3xl md:text-4xl font-bold mb-16">
            Built on Verification & Scale
          </h2>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-10">

            <TrustBlock
              title="Moderated Listings"
              text="Every property undergoes structured review before approval."
            />

            <TrustBlock
              title="Direct Seller Contact"
              text="No unnecessary layers between buyers and sellers."
            />

            <TrustBlock
              title="Performance Driven"
              text="Track views, leads, and engagement inside your dashboard."
            />

          </div>

        </div>
      </section>

    </main>
  );
}

/* ================= HELPERS ================= */

function SectionHeader({
  title,
  subtitle,
  href,
  linkText,
}: {
  title: string;
  subtitle: string;
  href: string;
  linkText: string;
}) {
  return (
    <div className="flex justify-between items-end mb-12">
      <div>
        <h2 className="text-3xl font-bold">{title}</h2>
        <p className="text-sm text-muted mt-2">{subtitle}</p>
      </div>

      <Link href={href} className="text-primary text-sm">
        {linkText}
      </Link>
    </div>
  );
}

function PropertyGrid({ properties }: { properties: any[] | null }) {

  if (!properties?.length) {
    return (
      <div className="text-center py-12 text-sm text-muted">
        No properties available right now.
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
      {properties.map((property: any) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  );
}

function TrustBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {title}
      </h3>
      <p className="text-sm text-muted">
        {text}
      </p>
    </div>
  );
}
