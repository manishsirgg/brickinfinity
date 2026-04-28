"use client";

import { useMemo, useState } from "react";

export default function ShareButtons({ url, title }: { url: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = useMemo(() => encodeURIComponent(url), [url]);
  const shareTitle = title || "Check out this property on BrickInfinity";
  const encodedTitle = useMemo(() => encodeURIComponent(shareTitle), [shareTitle]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Copy failed", error);
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        url,
      });
    } catch {
      // ignore user cancellation
    }
  }

  const shareLinks = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
    { label: "Email", href: `mailto:?subject=${encodedTitle}&body=${encodedTitle}%20${encodedUrl}` },
    { label: "SMS", href: `sms:?body=${encodedTitle}%20${encodedUrl}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}` },
    { label: "Instagram", href: `https://www.instagram.com/` },
  ];

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted mb-2">Share</p>
      <div className="flex flex-wrap gap-2 text-sm pt-1 relative">
        <button type="button" className="chip" onClick={nativeShare}>
          Share
        </button>

        <button type="button" className="chip" onClick={copyLink}>
          Copy link
        </button>

        {shareLinks.map((item) => (
          <a key={item.label} href={item.href} target="_blank" rel="noreferrer" className="chip">
            {item.label}
          </a>
        ))}

        {copied && (
          <div className="absolute -bottom-8 left-0 text-xs bg-black text-white px-2 py-1 rounded">
            Link copied ✓
          </div>
        )}
      </div>
    </div>
  );
}
