"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PropertyAvailability from "./PropertyAvailability";
import { needsAvailabilityConfirmation, PUBLIC_AVAILABILITY, type RentalDetails } from "@/lib/property-rental-details";
export default function ListingAvailabilityControl({ property }: { property: RentalDetails & { id: string } }) {
  const [value, setValue] = useState(property);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = PUBLIC_AVAILABILITY.includes(value.availability_status || "unknown");
  return <div className="space-y-2"><PropertyAvailability property={value} />
    {current && needsAvailabilityConfirmation(value) && <p className="text-xs text-amber-800">Please reconfirm availability. Confirm every 30 days to help buyers avoid stale listings.</p>}
    {current && <button type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={async () => {
      setBusy(true); setError("");
      try {
        const { data, error } = await createClient().rpc("confirm_property_availability", { p_property_id: property.id });
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Availability confirmation was not returned.");
        setValue(prev => ({ ...prev, availability_status: prev.availability_status === "unknown" ? "available" : prev.availability_status, availability_confirmed_at: data }));
      } catch (error) { setError(error instanceof Error ? error.message : "Could not confirm availability."); }
      finally { setBusy(false); }
    }}>{busy ? "Confirming…" : value.availability_status === "unknown" ? "Confirm available now" : "Reconfirm availability"}</button>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
