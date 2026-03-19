"use client";

import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();

    // Full reload ensures SSR + Navbar reset
    window.location.href = "/";
  };

  return (
    <button
      onClick={handleLogout}
      className="text-red-600 hover:text-red-700 transition w-full text-left"
    >
      Logout
    </button>
  );
}