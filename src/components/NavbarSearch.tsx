"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function NavbarSearch() {

  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    const value = query
      .replace(/\s+/g, " ")
      .trim();

    if (!value) return;

    const params = new URLSearchParams();
    params.set("keyword", value);

    const targetBase = pathname?.startsWith("/rent") ? "/rent" : "/buy";
    router.push(`${targetBase}?${params.toString()}`);

    setQuery("");
  }

  return (
    <form
      onSubmit={handleSearch}
      className="w-full max-w-md"
    >

      <div className="relative">

        <input
          type="text"
          placeholder="Search city, locality, property type..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-gray-100 border border-gray-200 rounded-full px-5 py-2.5 text-sm focus:bg-white focus:border-gray-300 focus:ring-2 focus:ring-red-500/20 outline-none transition"
        />

        <button
          type="submit"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition"
        >
          🔍
        </button>

      </div>

    </form>
  );
}
