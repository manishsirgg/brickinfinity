export type PropertyLinkInput = {
  id?: string | null;
  slug?: string | null;
};

export type PropertySummary = {
  id: string;
  title: string;
  slug: string | null;
  listing_type: string | null;
  property_type: string | null;
  price: number | null;
  hourly_rate: number | null;
  daily_rate: number | null;
  monthly_rate: number | null;
  href: string | null;
};

export function buildPropertyHref(property: PropertyLinkInput): string | null {
  if (!property?.id) return null;
  const slug = typeof property.slug === "string" ? property.slug.trim() : "";
  if (!slug) return null;
  return `/property/${property.id}/${slug}`;
}

export function getContactPropertyId(input: any): string | null {
  const meta = (input?.metadata && typeof input.metadata === "object") ? input.metadata : {};
  return input?.property_id ?? meta?.last_property_id ?? null;
}

export function getContactPropertySlug(input: any): string | null {
  const meta = (input?.metadata && typeof input.metadata === "object") ? input.metadata : {};
  return input?.property_slug ?? meta?.last_property_slug ?? meta?.property_slug ?? null;
}

export function buildPropertySummary(property: any): PropertySummary {
  return {
    id: property.id,
    title: property.title || property.property_type || "Property",
    slug: property.slug ?? null,
    listing_type: property.listing_type ?? null,
    property_type: property.property_type ?? null,
    price: property.price ?? null,
    hourly_rate: property.hourly_rate ?? null,
    daily_rate: property.daily_rate ?? null,
    monthly_rate: property.monthly_rate ?? null,
    href: buildPropertyHref({ id: property.id, slug: property.slug }),
  };
}
