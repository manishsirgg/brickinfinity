"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string;
  className?: string;
  successRedirect?: string;
  label?: string;
};

export default function CancelStaleOrderButton({
  orderId,
  className,
  successRedirect,
  label = "Cancel stale",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/finance/property-featured/orders/${orderId}/cancel-stale`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error || "Unable to cancel stale order.");
        return;
      }

      if (successRedirect) {
        router.push(successRedirect);
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to cancel stale order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button type="button" className={className} onClick={onCancel} disabled={loading}>
        {loading ? "Cancelling..." : label}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
