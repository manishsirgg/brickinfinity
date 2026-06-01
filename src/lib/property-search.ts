export type PropertyTypeIntentKey =
  | "commercial"
  | "plot"
  | "apartment"
  | "villa"
  | "house"
  | "residential";

export type PropertyTypeSearchIntent = {
  key: PropertyTypeIntentKey;
  label: string;
  propertyTypes: string[];
  aliases: string[];
};

export type ListingTypeSearchIntent = {
  key: "rent" | "sale";
  label: string;
  listingType: "Rent" | "Sale";
  aliases: string[];
};

const PROPERTY_TYPE_INTENTS: PropertyTypeSearchIntent[] = [
  {
    key: "plot",
    label: "Plot / Land",
    propertyTypes: ["Plot"],
    aliases: ["plot", "plots", "land", "residential plot", "commercial plot", "land parcel"],
  },
  {
    key: "commercial",
    label: "Commercial Space",
    propertyTypes: ["Commercial"],
    aliases: [
      "shop",
      "shops",
      "showroom",
      "showrooms",
      "office",
      "offices",
      "commercial",
      "commercial space",
      "retail",
      "store",
      "stores",
      "business space",
    ],
  },
  {
    key: "apartment",
    label: "Apartment / Flat",
    propertyTypes: ["Apartment"],
    aliases: ["apartment", "apartments", "flat", "flats"],
  },
  {
    key: "villa",
    label: "Villa / House",
    propertyTypes: ["Villa", "House"],
    aliases: ["villa", "villas", "bungalow", "bungalows"],
  },
  {
    key: "house",
    label: "House / Home",
    propertyTypes: ["House", "Villa"],
    aliases: ["home", "homes", "house", "houses", "independent house", "independent houses"],
  },
  {
    key: "residential",
    label: "Residential Home",
    propertyTypes: ["Apartment", "House", "Villa"],
    aliases: ["residential", "residential property", "residential properties"],
  },
];

const LISTING_TYPE_INTENTS: ListingTypeSearchIntent[] = [
  {
    key: "rent",
    label: "Rent",
    listingType: "Rent",
    aliases: ["rent", "rental", "rentals", "lease", "for rent"],
  },
  {
    key: "sale",
    label: "Buy / Sale",
    listingType: "Sale",
    aliases: ["buy", "sale", "sell", "purchase", "for sale"],
  },
];

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function normalizeAlias(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function includesSearchPhrase(search: string, alias: string) {
  const normalizedAlias = normalizeAlias(alias);
  if (!normalizedAlias) return false;

  const searchWithBoundaries = ` ${search} `;
  if (searchWithBoundaries.includes(` ${normalizedAlias} `)) return true;

  const singularSearch = search
    .split(" ")
    .map(singularizeToken)
    .join(" ");

  return ` ${singularSearch} `.includes(` ${normalizedAlias} `);
}

export function normalizeSearchTerm(input: string) {
  return normalizeAlias(input);
}

export function getPropertyTypeSearchIntent(search: string) {
  const normalized = normalizeSearchTerm(search);
  if (!normalized) return null;

  return (
    PROPERTY_TYPE_INTENTS.find((intent) =>
      intent.aliases.some((alias) => includesSearchPhrase(normalized, alias))
    ) ?? null
  );
}

export function getPropertyTypeIntent(search: string) {
  return getPropertyTypeSearchIntent(search)?.key ?? null;
}

export function getListingTypeSearchIntent(search: string) {
  const normalized = normalizeSearchTerm(search);
  if (!normalized) return null;

  return (
    LISTING_TYPE_INTENTS.find((intent) =>
      intent.aliases.some((alias) => includesSearchPhrase(normalized, alias))
    ) ?? null
  );
}

export function getListingTypeIntent(search: string) {
  return getListingTypeSearchIntent(search)?.listingType ?? null;
}

export function getSearchAliases(search: string) {
  const normalized = normalizeSearchTerm(search);
  const aliases = new Set<string>();

  if (normalized) aliases.add(normalized);

  const propertyIntent = getPropertyTypeSearchIntent(normalized);
  propertyIntent?.aliases.forEach((alias) => aliases.add(normalizeAlias(alias)));
  propertyIntent?.propertyTypes.forEach((type) => aliases.add(normalizeAlias(type)));

  const listingIntent = getListingTypeSearchIntent(normalized);
  listingIntent?.aliases.forEach((alias) => aliases.add(normalizeAlias(alias)));
  if (listingIntent?.listingType) aliases.add(normalizeAlias(listingIntent.listingType));

  return Array.from(aliases).filter(Boolean);
}
