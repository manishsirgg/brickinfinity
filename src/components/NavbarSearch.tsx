"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type NavbarSearchProps = {
  onSearchSubmit?: () => void;
};

export default function NavbarSearch({ onSearchSubmit }: NavbarSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const value = query.replace(/\s+/g, " ").trim();
    const params = new URLSearchParams();
    if (value) params.set("search", value);

    router.push(params.toString() ? `/properties?${params.toString()}` : "/properties");
    onSearchSubmit?.();
    setQuery("");
  }

  return (
    <form onSubmit={handleSearch} className="w-full max-w-md min-w-0">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by city, location, property type, or keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-w-0 bg-gray-100 border border-gray-200 rounded-full px-5 py-2.5 pr-11 text-sm focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-red-500/20 outline-none transition"
        />
        <button
          type="submit"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition"
          aria-label="Search properties"
        >
          🔍
        </button>
      </div>
    </form>
  );
}
