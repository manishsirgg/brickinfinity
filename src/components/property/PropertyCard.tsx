"use client"

import Link from "next/link"

type Props = {
  property: any
}

export default function PropertyCard({ property }: Props) {

  const image =
    property?.property_images?.[0]?.image_url ||
    "/placeholder.jpg"

  const formattedPrice =
    property?.price
      ? new Intl.NumberFormat("en-IN").format(property.price)
      : "0"

  const pricePerSqft =
    property?.built_up_area
      ? Math.round(property.price / property.built_up_area)
      : null

  const isNew =
    property?.created_at &&
    new Date(property.created_at) >
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const isPopular =
    property?.views_count && property.views_count > 50

  const topAmenities =
    Array.isArray(property?.amenities)
      ? property.amenities.slice(0, 3)
      : []

  const isRent =
    property?.listing_type?.toLowerCase() === "rent"

  /* ⭐ SAFE PROPERTY URL */

  const propertyUrl =
    property?.slug
      ? `/property/${property.id}/${property.slug}`
      : `/property/${property.id}`

  return (

    <Link
      href={propertyUrl}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition duration-300 group block"
    >

      {/* IMAGE */}

      <div className="relative overflow-hidden">

        <img
          src={image}
          className="h-56 md:h-60 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt={property?.property_type || "Property"}
        />

        {/* BADGES */}

        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">

          <span
            className={`text-white text-xs px-3 py-1 rounded-full ${
              isRent ? "bg-blue-600" : "bg-green-600"
            }`}
          >
            {isRent ? "For Rent" : "For Sale"}
          </span>

          {property?.is_featured && (
            <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">
              Featured
            </span>
          )}

          {property?.ownership_verified && (
            <span className="bg-green-600 text-white text-xs px-3 py-1 rounded-full">
              Verified
            </span>
          )}

          {isNew && (
            <span className="bg-blue-600 text-white text-xs px-3 py-1 rounded-full">
              New
            </span>
          )}

        </div>

        {isPopular && (
          <span className="absolute top-3 right-3 bg-black/70 text-white text-xs px-3 py-1 rounded-full">
            🔥 Popular
          </span>
        )}

      </div>

      {/* CONTENT */}

      <div className="p-5 space-y-3">

        {/* PRICE */}

        <div>
          <p className="text-xl font-bold text-primary">
            ₹ {formattedPrice}
            {isRent && (
              <span className="text-sm text-muted font-medium">
                {" "} / month
              </span>
            )}
          </p>

          {pricePerSqft && (
            <p className="text-xs text-muted">
              ₹ {pricePerSqft} / sqft {isRent && "/ month"}
            </p>
          )}
        </div>

        {/* TITLE */}

        <p className="font-semibold text-[var(--color-dark)]">
          {property?.property_type}
        </p>

        {/* LOCATION */}

        <p className="text-sm text-muted">
          {property?.localities?.name},{" "}
          {property?.cities?.name}
        </p>

        {/* SPECS */}

        <div className="flex gap-4 text-sm text-muted flex-wrap">

          {property?.bedrooms && (
            <span>🛏 {property.bedrooms}</span>
          )}

          {property?.bathrooms && (
            <span>🚿 {property.bathrooms}</span>
          )}

          {property?.built_up_area && (
            <span>📐 {property.built_up_area} sqft</span>
          )}

        </div>

        {/* AMENITIES */}

        {topAmenities.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {topAmenities.map((a: string) => (
              <span
                key={a}
                className="bg-gray-100 px-2 py-1 rounded"
              >
                {a}
              </span>
            ))}
          </div>
        )}

      </div>

    </Link>

  )
}