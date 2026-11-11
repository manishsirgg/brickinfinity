export const PROPERTY_SORTS = {
  newest: "Newest first",
  updated: "Recently updated",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  area_desc: "Area: largest first",
  area_asc: "Area: smallest first",
} as const;
export const SEARCH_AMENITIES = ["Lift", "Gym", "Power Backup", "24x7 Security", "CCTV", "Visitor Parking", "Water Supply", "Air Conditioning", "Wheelchair Accessible", "Swimming Pool", "Intercom", "Garden", "Club House", "Children Play Area", "Jogging Track", "Community Hall", "Senior Citizen Area", "Rainwater Harvesting", "Fire Safety", "Gas Pipeline", "Wi-Fi", "Balcony", "Modular Kitchen", "Pet Friendly", "EV Charging", "Nearby Metro", "School Nearby", "Hospital Nearby", "Shopping Mall Nearby"];
export const PROPERTY_TYPES = ["Apartment", "House", "Villa", "Plot", "Office", "Commercial"];
export const FURNISHING_TYPES = ["Unfurnished", "Semi Furnished", "Fully Furnished"];
export function parsePropertySort(value?: string) {
  return value && Object.hasOwn(PROPERTY_SORTS, value) ? value as keyof typeof PROPERTY_SORTS : "newest";
}
export function propertySortOrder(value?: string) {
  const sort = parsePropertySort(value);
  return { column: sort.startsWith("price") ? "price" : sort.startsWith("area") ? "built_up_area" : sort === "updated" ? "updated_at" : "created_at", ascending: sort.endsWith("_asc") };
}
