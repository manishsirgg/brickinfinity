import PropertyAvailability from "@/components/property/PropertyAvailability";
import { createClient } from "@/lib/supabase/server";
import { getCoverImage } from "@/lib/property-images";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default async function SavedPropertiesPage() {

  const supabase = await createClient();

  const { data: { session } } =
    await supabase.auth.getSession();

  // ✅ Proper auth protection
  if (!session) {
    redirect("/login");
  }

  // ✅ Fetch only ACTIVE + VERIFIED + NOT DELETED properties
  const { data: favorites } =
    await supabase
      .from("favorites")
      .select(`
        properties(
          id,
          slug,
          property_type,
          price,
          status,
          availability_status,available_from,availability_confirmed_at,
          ownership_verified,
          deleted_at,
          property_images(image_url,sort_order)
        )
      `)
      .eq("user_id", session.user.id)
      .eq("properties.status", "active")
      .eq("properties.ownership_verified", true)
      .is("properties.deleted_at", null);

  const properties =
    favorites?.map(f => f.properties).filter(Boolean) || [];

  return (

    <main className="max-w-7xl mx-auto px-6 py-16">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-10">

        <h1 className="text-3xl font-semibold">
          Saved Properties
        </h1>

        <Link
          href="/properties"
          className="text-sm text-red-600 hover:underline"
        >
          Browse More →
        </Link>

      </div>

      {/* EMPTY STATE */}
      {properties.length === 0 && (

        <div className="border rounded-xl p-12 text-center bg-gray-50">

          <h2 className="text-lg font-medium mb-2">
            No Saved Properties Yet
          </h2>

          <p className="text-gray-500 mb-6">
            Start exploring properties and save your favourites.
          </p>

          <Link
            href="/"
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-full text-sm font-medium transition"
          >
            Explore Properties
          </Link>

        </div>

      )}

      {/* GRID */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

        {properties.map((p: any) => {

          const img =
            getCoverImage(p.property_images);

          const propertyUrl =
            `/property/${p.id}/${p.slug}`;

          return (

            <Link
              key={p.id}
              href={propertyUrl}
              className="group border rounded-xl overflow-hidden hover:shadow-xl transition transform hover:-translate-y-1"
            >

              <div className="relative aspect-square w-full">

                <Image
                  src={img}
                  alt="Property"
                  fill
                  className="object-cover group-hover:scale-105 transition"
                />

              </div>

              <div className="p-4 space-y-1">
                <PropertyAvailability property={p} />

                <p className="text-sm text-gray-500">
                  {p.property_type}
                </p>

                <p className="font-semibold text-lg">
                  ₹ {new Intl.NumberFormat("en-IN")
                    .format(p.price)}
                </p>

              </div>

            </Link>

          );

        })}

      </div>

    </main>
  );
}