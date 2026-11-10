type PropertyImage = { image_url?: string | null; sort_order?: number | null };

export function getCoverImage(images?: PropertyImage[] | null) {
  return images?.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.image_url || "/placeholder.jpg";
}
