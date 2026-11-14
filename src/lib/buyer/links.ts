export function savedSearchHref(values: Record<string, string>) {
  return `/properties?${new URLSearchParams(values)}`;
}
