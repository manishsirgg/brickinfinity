"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { identityLabel, type IdentityDocument } from "@/lib/identity-review";

export default function IdentityDocumentPreview({ document }: { document: IdentityDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setUrl(null); setError("");
    void (async () => {
      try {
        const { data, error } = await createClient().storage.from("identity-documents").createSignedUrl(document.document_url, 300);
        if (error || !data?.signedUrl) throw new Error("Private preview unavailable. Refresh the preview or inspect the stored file.");
        if (!cancelled) setUrl(data.signedUrl);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "Preview could not be loaded."); }
    })();
    return () => { cancelled = true; };
  }, [document.document_url, revision]);
  const label = identityLabel(document.document_type);
  return <div className="space-y-2">
    {!url && !error && <p className="text-sm text-slate-600">Loading {label} preview…</p>}
    {error && <p className="text-sm text-red-700">{error}</p>}
    {url && <>
      {/\.pdf$/i.test(document.document_url) ? <iframe title={`${label} preview`} src={url} className="h-72 w-full rounded border" /> : <img src={url} alt={`${label} identity evidence`} className="h-72 w-full rounded border bg-slate-50 object-contain" />}
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open {label} privately</a>
    </>}
    <button type="button" className="block text-xs underline" onClick={() => setRevision(value => value + 1)}>Refresh {label} preview</button>
  </div>;
}
