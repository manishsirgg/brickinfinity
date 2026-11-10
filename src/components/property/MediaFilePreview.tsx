"use client";

import { useEffect, useState } from "react";

export default function MediaFilePreview({ file, video = false }: { file: File; video?: boolean }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (!url) return null;
  return video
    ? <video src={url} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" />
    : <img src={url} alt={file.name} className="aspect-square w-full rounded-lg object-cover" />;
}
