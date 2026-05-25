"use client"

import Link from "next/link"
import { isPropertyFeaturedActive } from "@/lib/property-featured"

type PropertyCardProperty = {
  id: string
  slug?: string | null
  property_type?: string | null
  listing_type?: string | null
  property_images?: { image_url?: string | null }[] | null
  hourly_rate?: number | null
  daily_rate?: number | null
  monthly_rate?: number | null
  price?: number | null
  built_up_area?: number | null
  created_at?: string | null
  views_count?: number | null
  amenities?: string[] | null
  ownership_verified?: boolean | null
  is_featured?: boolean | null
  featured_until?: string | null
  localities?: { name?: string | null } | null
  cities?: { name?: string | null } | null
  bedrooms?: number | null
  bathrooms?: number | null
}

type Props = {
  property: PropertyCardProperty
}

function getRentPriceDetails(property: PropertyCardProperty) {
  const hourly = Number(property?.hourly_rate || 0)
  const daily = Number(property?.daily_rate || 0)
  const monthly = Number(property?.monthly_rate || property?.price || 0)

  if (hourly > 0) return { amount: hourly, label: "/ hour" }
  if (daily > 0) return { amount: daily, label: "/ day" }
  return { amount: monthly, label: "/ month" }
}


function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) return false

  if (typeof value === "string") {
    const trimmed = value.trim()
    return (
      trimmed !== "" &&
      trimmed !== "0" &&
      trimmed !== "00" &&
      trimmed.toLowerCase() !== "null" &&
      trimmed.toLowerCase() !== "undefined"
    )
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0
  }

  return true
}

export default function PropertyCard({ property }: Props) {
  const image = property?.property_images?.[0]?.image_url || "/placeholder.jpg"

  const propertyType = hasMeaningfulValue(property?.property_type) ? String(property.property_type).trim() : null
  const locality = hasMeaningfulValue(property?.localities?.name) ? String(property.localities?.name).trim() : null
  const city = hasMeaningfulValue(property?.cities?.name) ? String(property.cities?.name).trim() : null

  const locationParts = [locality, city].filter((part): part is string => Boolean(part))

  const bedrooms = hasMeaningfulValue(property?.bedrooms) ? Number(property?.bedrooms) : null
  const bathrooms = hasMeaningfulValue(property?.bathrooms) ? Number(property?.bathrooms) : null
  const builtUpArea = hasMeaningfulValue(property?.built_up_area) ? Number(property?.built_up_area) : null

  const isRent = property?.listing_type?.toLowerCase() === "rent"

  const rentPrice = isRent ? getRentPriceDetails(property) : null

  const displayPrice = isRent ? rentPrice?.amount || 0 : property?.price || 0

  const formattedPrice = new Intl.NumberFormat("en-IN").format(displayPrice)

  const pricePerSqft = builtUpArea ? Math.round(displayPrice / builtUpArea) : null

  const isNew =
    property?.created_at &&
    new Date(property.created_at) > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const isPopular = property?.views_count && property.views_count > 50

  const topAmenities = Array.isArray(property?.amenities)
    ? property.amenities.slice(0, 3)
    : []

  const propertyUrl =
    property?.slug
      ? `/property/${property.id}/${property.slug}`
      : `/property/${property.id}`

  const isFeaturedActive = isPropertyFeaturedActive(property)

  return (
    <Link
      href={propertyUrl}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition duration-300 group block"
    >
      <div className="relative overflow-hidden">
        <img
          src={image}
          className="h-56 md:h-60 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          alt={property?.property_type || "Property"}
        />

        <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
          <span
            className={`text-white text-xs px-3 py-1 rounded-full ${
              isRent ? "bg-blue-600" : "bg-green-600"
            }`}
          >
            {isRent ? "For Rent" : "For Sale"}
          </span>

          {isFeaturedActive && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm">
              ⭐ Featured
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

      <div className="p-5 space-y-3">
        <div>
          <p className="text-xl font-bold text-primary">
            ₹ {formattedPrice}
            {isRent && (
              <span className="text-sm text-muted font-medium">
                {" "}{rentPrice?.label}
              </span>
            )}
          </p>

          {pricePerSqft && (
            <p className="text-xs text-muted">
              ₹ {pricePerSqft} / sqft {isRent ? rentPrice?.label : ""}
            </p>
          )}
        </div>

        {propertyType && (
          <p className="font-semibold text-[var(--color-dark)]">
            {propertyType}
          </p>
        )}

        {locationParts.length > 0 && (
          <p className="text-sm text-muted">
            {locationParts.join(", ")}
          </p>
        )}

        <div className="flex gap-4 text-sm text-muted flex-wrap">
          {bedrooms && <span>🛏 {bedrooms}</span>}

          {bathrooms && <span>🚿 {bathrooms}</span>}

          {builtUpArea && <span>📐 {builtUpArea} sqft</span>}
        </div>

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
