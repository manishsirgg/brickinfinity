export type PropertyLinkInput = {
  id?: string | null;
  slug?: string | null;
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
