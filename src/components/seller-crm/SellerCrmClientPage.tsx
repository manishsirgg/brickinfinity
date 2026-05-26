"use client";
import { useEffect, useState } from "react";

export function SellerCrmClientPage({ title, subtitle, endpoint }: { title: string; subtitle?: string; endpoint: string }) {
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch(endpoint).then((r) => r.json()).then((j) => { if (!j.ok) throw new Error(j.error ?? "Request failed"); setData(j.data); }).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [endpoint]);
  return <div className="max-w-7xl mx-auto px-4 py-8 space-y-4"><h1 className="text-2xl font-bold">{title}</h1>{subtitle ? <p className="text-gray-500">{subtitle}</p> : null}{loading ? <div className="rounded-xl border p-6">Loading...</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div> : <pre className="rounded-xl border bg-white p-4 overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>}</div>;
}
