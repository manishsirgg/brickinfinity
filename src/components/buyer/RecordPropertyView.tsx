"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
export default function RecordPropertyView({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    let stopped = false;
    const timer = setTimeout(async () => {
      try {
        if (document.visibilityState !== "visible") return;
        const { data: { user } } = await createClient().auth.getUser();
        if (!user || stopped) return;
        const key = `brick-view:${user.id}:${propertyId}`;
        let last = 0;
        try { last = Number(sessionStorage.getItem(key) || 0); } catch { /* History still works when browser storage is disabled. */ }
        if (last > Date.now() - 30 * 60000) return;
        const response = await fetch("/api/buyer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view", property_id: propertyId }) });
        if (response.ok) { try { sessionStorage.setItem(key, String(Date.now())); } catch { /* Optional client deduplication. */ } }
      } catch { /* Activity recording must not prevent reading the listing. */ }
    }, 1200);
    return () => { stopped = true; clearTimeout(timer); };
  }, [propertyId]);
  return null;
}
