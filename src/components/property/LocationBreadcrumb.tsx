import Link from "next/link";

type Location = { id: string; name: string };
type Props = { state?: Location; city?: Location; locality?: Location };

export default function LocationBreadcrumb({ state, city, locality }: Props) {
  const query = new URLSearchParams();
  const links: { name: string; href: string }[] = [{ name: "Home", href: "/" }];
  for (const [key, location] of [["state_id", state], ["city_id", city], ["locality_id", locality]] as const) {
    if (!location?.id || !location.name) continue;
    query.set(key, location.id);
    links.push({ name: location.name, href: `/properties?${query}` });
  }
  return (
    <nav aria-label="Property location" className="mb-6 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {links.map((link, index) => (
          <li key={link.href} className="inline-flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">›</span>}
            <Link href={link.href} className="rounded hover:underline focus-visible:outline focus-visible:outline-2">{link.name}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
