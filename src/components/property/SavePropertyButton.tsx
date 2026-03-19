"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SavePropertyButton({
  propertyId,
  initialSaved
}: {
  propertyId: string;
  initialSaved: boolean;
}) {

  const router = useRouter();

  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  async function toggle() {

    if (loading) return;

    setLoading(true);

    try {

      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId })
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to update favorites");
      }

      const data = await res.json();

      setSaved(data.saved);

    } catch (err) {

      console.error("Favorite toggle error:", err);
      alert("Something went wrong. Please try again.");

    } finally {

      setLoading(false);

    }

  }

  return (

    <button
      onClick={toggle}
      disabled={loading}
      className={`px-4 py-2 rounded-md border text-sm transition
        ${saved
          ? "bg-red-50 border-red-300 text-red-600"
          : "bg-white border-gray-300 hover:bg-gray-50"
        }
        ${loading ? "opacity-60 cursor-not-allowed" : ""}
      `}
    >
      {loading
        ? "Updating..."
        : saved
        ? "♥ Saved"
        : "♡ Save Property"}
    </button>

  );
}