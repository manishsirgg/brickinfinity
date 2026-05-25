export type FeaturedPropertyLike = {
  is_featured?: boolean | null;
  featured_until?: string | null;
  featured_rank?: number | null;
};

export function isPropertyFeaturedActive(property: FeaturedPropertyLike) {
  if (!property.is_featured || !property.featured_until) return false;

  const featuredUntil = new Date(property.featured_until);

  if (Number.isNaN(featuredUntil.getTime())) return false;

  return featuredUntil.getTime() > Date.now();
}

export function formatFeaturedUntil(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function sortFeaturedPropertiesFirst<T extends FeaturedPropertyLike>(
  properties: T[]
): T[] {
  return [...properties].sort((a, b) => {
    const aFeatured = isPropertyFeaturedActive(a);
    const bFeatured = isPropertyFeaturedActive(b);

    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;

    const aRank = aFeatured ? Number(a.featured_rank || 0) : 0;
    const bRank = bFeatured ? Number(b.featured_rank || 0) : 0;

    if (aRank !== bRank) return bRank - aRank;

    const aFeaturedUntil =
      aFeatured && a.featured_until
        ? new Date(a.featured_until).getTime()
        : 0;

    const bFeaturedUntil =
      bFeatured && b.featured_until
        ? new Date(b.featured_until).getTime()
        : 0;

    if (aFeaturedUntil !== bFeaturedUntil) {
      return bFeaturedUntil - aFeaturedUntil;
    }

    return 0;
  });
}
