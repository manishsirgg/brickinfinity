"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { parseCompareIds, propertyIdPattern as uuid } from "@/lib/buyer/compare-selection";
const KEY = "brickinfinity-compare-v1", EVENT = "brickinfinity-compare-change";
function snapshot() { try { return localStorage.getItem(KEY) || "[]"; } catch { return "[]"; } }
function subscribe(callback: () => void) { window.addEventListener(EVENT, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", callback); }; }
function useComparison() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  return useMemo(() => parseCompareIds(raw), [raw]);
}
function store(ids: string[]) { localStorage.setItem(KEY, JSON.stringify(ids)); window.dispatchEvent(new Event(EVENT)); }
export function CompareButton({ propertyId }: { propertyId: string }) {
  const ids = useComparison(), [error, setError] = useState("");
  const selected = ids.includes(propertyId.toLowerCase());
  return <div className="space-y-1"><button type="button" aria-pressed={selected} className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50" onClick={() => {
    setError(""); const current = parseCompareIds(snapshot());
    if (!uuid.test(propertyId)) { setError("This property cannot be compared."); return; }
    const id = propertyId.toLowerCase();
    if (!current.includes(id) && current.length >= 3) { setError("You can compare up to three properties. Remove one first."); return; }
    try { store(current.includes(id) ? current.filter(v => v !== id) : [...current, id]); } catch { setError("Comparison storage is unavailable in this browser."); }
  }}>{selected ? "✓ Added to comparison" : "+ Compare"}</button>{error && <p role="alert" className="text-xs text-red-700">{error} <Link href={`/compare?ids=${ids.join(",")}`} className="underline">Open comparison</Link></p>}</div>;
}
export function CompareTray() {
  const ids = useComparison(), [error, setError] = useState("");
  if (!ids.length) return null;
  return <aside aria-label="Property comparison" className="fixed bottom-3 left-3 z-40 max-w-[calc(100vw-7rem)] rounded-xl border border-slate-300 bg-white p-3 shadow-xl sm:bottom-5 sm:left-5"><div className="flex flex-wrap items-center gap-3 text-sm"><Link href={`/compare?ids=${ids.join(",")}`} className="font-semibold underline">Compare {ids.length} / 3 properties</Link><button onClick={() => { try { store([]); setError(""); } catch { setError("Unable to clear comparison."); } }} className="text-xs underline">Clear</button></div>{error && <p role="alert">{error}</p>}</aside>;
}
export function EmptyComparison() {
  const ids = useComparison();
  return <div className="rounded-xl border p-6 space-y-3"><p>Select up to three properties using “Compare” on listing cards or property details.</p>{ids.length > 0 && <Link href={`/compare?ids=${ids.join(",")}`} className="underline">Open your selected comparison ({ids.length})</Link>}<p><Link href="/properties" className="underline">Browse properties</Link></p></div>;
}

export function RemoveComparisonColumn({ propertyId, ids }: { propertyId: string; ids: string[] }) {
  const router = useRouter();
  return <button type="button" className="text-sm font-normal underline" onClick={() => {
    try { store(parseCompareIds(snapshot()).filter(id => id !== propertyId.toLowerCase())); } catch { /* URL comparison still works without browser storage. */ }
    const remaining = ids.filter(id => id.toLowerCase() !== propertyId.toLowerCase());
    router.push(remaining.length ? `/compare?ids=${remaining.join(",")}` : "/compare");
  }}>Remove from comparison</button>;
}
