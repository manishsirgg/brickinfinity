"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { identityLabel, latestIdentityDocuments, type IdentityDocument } from "@/lib/identity-review";

type LinkItem = { label: string; url: string | null };
export default function DeclarationChangeEvidence({ userId, paths, includeIdentity = false }: { userId: string; paths: string[]; includeIdentity?: boolean }) {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const pathsKey = JSON.stringify(paths);
  useEffect(() => {
    let cancelled = false;
    setLinks([]); setError("");
    const db = createClient();
    void (async () => {
      try {
        const files = (JSON.parse(pathsKey) as string[]).map((path, i) => ({ path, bucket: "declaration-documents", label: `Change request evidence ${i + 1}` }));
        if (includeIdentity) {
          const { data, error } = await db.from("documents").select("id,user_id,document_type,document_url,status,created_at").eq("user_id", userId).is("property_id", null).order("created_at", { ascending: false }).order("id", { ascending: false });
          if (error) throw new Error("Current identity evidence could not be loaded.");
          for (const doc of latestIdentityDocuments((data || []) as IdentityDocument[])) files.push({ path: doc.document_url, bucket: "identity-documents", label: `${identityLabel(doc.document_type)} — ${doc.status}` });
        }
        const previews = await Promise.all(files.map(async file => {
          const { data } = await db.storage.from(file.bucket).createSignedUrl(file.path, 300);
          return { label: file.label, url: data?.signedUrl || null };
        }));
        if (!cancelled) setLinks(previews);
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : "Evidence could not be loaded."); }
    })();
    return () => { cancelled = true; };
  }, [userId, pathsKey, includeIdentity, revision]);
  return <div className="space-y-2 rounded-lg border p-3 text-sm"><p>Private evidence links expire after five minutes.</p>{error && <p className="text-red-700">{error}</p>}<ul className="space-y-2">{links.map((link, i) => <li key={i}>{link.url ? <a className="underline" href={link.url} target="_blank" rel="noopener noreferrer">View {link.label}</a> : <span className="text-red-700">File unavailable: {link.label}</span>}</li>)}</ul><button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Refresh evidence links</button></div>;
}
