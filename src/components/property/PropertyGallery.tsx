"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, Play, X } from "lucide-react";

type Props = {
  images: { id?: string; image_url: string; sort_order?: number | null }[];
  videos?: { id?: string; video_url: string }[];
  title?: string;
};

export default function PropertyGallery({ images = [], videos = [], title = "Property" }: Props) {
  const media = [
    ...images.filter(image => image.image_url).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((image, index) => ({ kind: "photo" as const, url: image.image_url, label: `Photo ${index + 1}` })),
    ...videos.filter(video => video.video_url)
      .map((video, index) => ({ kind: "video" as const, url: video.video_url, label: `Video ${index + 1}` })),
  ];
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const activeIndex = Math.min(index, media.length - 1);
  const active = media[activeIndex];
  const photoCount = media.filter(item => item.kind === "photo").length;
  const videoCount = media.length - photoCount;

  useEffect(() => {
    if (!expanded) return;
    const element = dialog.current;
    const trigger = expandButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [expanded]);

  function move(direction: number) {
    setIndex((activeIndex + direction + media.length) % media.length);
  }

  function handleKey(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    // Keep the video's native keyboard playback and seeking controls.
    if ((event.target as HTMLElement).tagName === "VIDEO") return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  function renderMedia() {
    if (!active) return null;
    const style = { width: "100%", height: "100%", objectFit: "contain" as const };
    return active.kind === "video"
      ? <video key={active.url} src={active.url} controls playsInline preload="metadata" aria-label={`${title} · ${active.label}`} style={style} />
      : <img key={active.url} src={active.url} alt={`${title} · ${active.label}`} decoding="async" style={style} />;
  }

  function navigation() {
    if (media.length < 2) return null;
    return <div className="flex items-center gap-2">
      <button type="button" onClick={() => move(-1)} aria-label="Previous media" className="rounded-full border border-slate-300 bg-white p-2 text-slate-800 hover:bg-slate-100"><ChevronLeft size={20} /></button>
      <span className="min-w-12 text-center text-sm tabular-nums" aria-live="polite">{activeIndex + 1} / {media.length}</span>
      <button type="button" onClick={() => move(1)} aria-label="Next media" className="rounded-full border border-slate-300 bg-white p-2 text-slate-800 hover:bg-slate-100"><ChevronRight size={20} /></button>
    </div>;
  }

  if (!media.length) return <section className="flex min-h-64 items-center justify-center rounded-2xl border bg-slate-50 text-slate-500">No photos or videos available</section>;

  return (
    <section aria-label="Property photos and videos" onKeyDown={handleKey} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold">Photos &amp; videos</h2>
          <p className="text-sm text-slate-500">{photoCount} {photoCount === 1 ? "photo" : "photos"}{videoCount > 0 ? ` · ${videoCount} ${videoCount === 1 ? "video" : "videos"}` : ""}</p>
        </div>
        <button ref={expandButton} type="button" onClick={() => setExpanded(true)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50"><Expand size={16} /> Expand gallery</button>
      </div>

      <div className="bg-slate-950" style={{ height: "clamp(260px, 52vw, 520px)", width: "100%" }}>
        {!expanded && renderMedia()}
      </div>

      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="text-sm font-medium">{active.label}{activeIndex === 0 && active.kind === "photo" ? " · Cover" : ""}</span>
        {navigation()}
      </div>
      <div aria-label="Choose a photo or video" className="flex gap-3 overflow-x-auto p-4">
        {media.map((item, itemIndex) => (
          <button key={`${item.kind}-${item.url}-${itemIndex}`} type="button" aria-label={`Show ${item.label.toLowerCase()}`} aria-pressed={activeIndex === itemIndex}
            onClick={() => setIndex(itemIndex)} className="shrink-0 overflow-hidden rounded-lg border-2 border-transparent bg-slate-100 p-1 text-slate-700 aria-pressed:border-blue-600 aria-pressed:bg-blue-50">
            <div className="flex items-center justify-center overflow-hidden rounded bg-slate-200" style={{ width: 88, height: 64 }}>
              {item.kind === "photo"
                ? <img src={item.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <Play size={24} aria-hidden="true" />}
            </div>
            <span className="block pt-1 text-xs">{item.label}</span>
          </button>
        ))}
      </div>

      {expanded && (
        <dialog ref={dialog} aria-label="Expanded property gallery" onCancel={() => setExpanded(false)} onClose={() => setExpanded(false)} onKeyDown={handleKey}
          className="fixed inset-0 m-auto w-[96vw] max-w-none rounded-2xl border-0 bg-slate-950 p-0 text-white backdrop:bg-black/80">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span>{active.label}</span>
            <button autoFocus type="button" onClick={() => setExpanded(false)} aria-label="Close gallery" className="rounded-full p-2 hover:bg-white/10"><X size={24} /></button>
          </div>
          <div style={{ height: "70dvh", width: "100%" }}>{renderMedia()}</div>
          <div className="flex justify-center px-4 py-3">{navigation()}</div>
        </dialog>
      )}
    </section>
  );
}
