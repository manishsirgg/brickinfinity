/** Public pages require publication; unpublished inventory stays in the owner dashboard. */
export function dashboardPropertyLink(property: {
  id: string;
  slug?: string | null;
  status?: string | null;
  verification_status?: string | null;
}) {
  const published = property.status === "active" && property.verification_status === "approved" && Boolean(property.slug?.trim());
  return {
    href: published ? `/property/${property.id}/${property.slug}` : `/dashboard/edit/${property.id}`,
    label: published ? "View" : "Review listing",
    published,
  };
}
