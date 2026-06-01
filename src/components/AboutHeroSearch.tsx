"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function AboutHeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.replace(/\s+/g, " ").trim();
    const params = new URLSearchParams();
    if (trimmedQuery) params.set("search", trimmedQuery);

    router.push(params.toString() ? `/properties?${params.toString()}` : "/properties");
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-4 shadow-lg">
      <label className="sr-only" htmlFor="about-hero-search">Search properties</label>
      <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 focus-within:border-red-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-red-100">
        <Search size={18} aria-hidden="true" />
        <input
          id="about-hero-search"
          name="search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search city, locality, property type..."
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-500"
        />
        <button type="submit" className="ml-auto hidden rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)] hover:text-white sm:inline">
          Smart Search
        </button>
      </div>
    </form>
  );
}
