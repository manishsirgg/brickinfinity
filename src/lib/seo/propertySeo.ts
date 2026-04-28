const SEO_TITLE_FALLBACK = "Property Listing on BrickInfinity";
const SEO_DESCRIPTION_FALLBACK = "Explore this property listing on BrickInfinity.";
const SEO_DESCRIPTION_MAX_LENGTH = 155;

export function buildPropertySeoFields(title: string, description: string) {
  const cleanTitle = title?.trim() || SEO_TITLE_FALLBACK;
  const cleanDescription =
    description?.replace(/\s+/g, " ").trim() || SEO_DESCRIPTION_FALLBACK;

  const trimmedDescription =
    cleanDescription.length > SEO_DESCRIPTION_MAX_LENGTH
      ? `${cleanDescription
          .slice(0, SEO_DESCRIPTION_MAX_LENGTH)
          .replace(/\s+\S*$/, "")}...`
      : cleanDescription;

  return {
    meta_title: cleanTitle,
    meta_description: trimmedDescription,
  };
}
