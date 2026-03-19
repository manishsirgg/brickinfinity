"use client";

import { useState, useEffect } from "react";

interface Props {
  images: { id?: string; image_url: string }[];
}

export default function PropertyGallery({ images = [] }: Props) {

  const [index, setIndex] = useState<number | null>(null);

  const hasImages = images.length > 0;

  const open = (i: number) => {
    if (!hasImages) return;
    setIndex(i);
  };

  const close = () => setIndex(null);

  const next = () => {
    if (index === null || !hasImages) return;
    setIndex((index + 1) % images.length);
  };

  const prev = () => {
    if (index === null || !hasImages) return;
    setIndex((index - 1 + images.length) % images.length);
  };

  /* KEYBOARD NAVIGATION */

  useEffect(() => {

    function handleKey(e: KeyboardEvent) {

      if (index === null) return;

      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();

    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);

  }, [index, images.length]);

  /* ===== NO IMAGES FALLBACK ===== */

  if (!hasImages) {
    return (
      <div className="border rounded-lg h-72 flex items-center justify-center text-muted">
        No images uploaded
      </div>
    );
  }

  return (

    <>
      {/* GRID */}

      <div className="grid md:grid-cols-3 gap-4">

        {images.map((img, i) => (
          <img
            key={img.id || i}
            src={img.image_url}
            onClick={() => open(i)}
            loading="lazy"
            className="cursor-pointer rounded-lg object-cover w-full h-72 hover:opacity-90 transition"
            alt="Property image"
          />
        ))}

      </div>

      {/* FULLSCREEN VIEWER */}

      {index !== null && (

        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">

          <button
            onClick={close}
            className="absolute top-6 right-6 text-white text-xl"
          >
            ✕
          </button>

          <button
            onClick={prev}
            className="absolute left-6 text-white text-3xl"
          >
            ‹
          </button>

          <img
            src={images[index]?.image_url}
            className="max-h-[85vh] max-w-[90vw] object-contain"
            alt="Preview"
          />

          <button
            onClick={next}
            className="absolute right-6 text-white text-3xl"
          >
            ›
          </button>

          <div className="absolute bottom-6 text-white text-sm">
            {index + 1} / {images.length}
          </div>

        </div>

      )}

    </>
  );
}