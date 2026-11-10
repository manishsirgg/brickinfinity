"use client";

import { createClient } from "@/lib/supabase/client";

/** Upload directly to Storage with real browser byte-transfer progress. */
export async function uploadVideo(path: string, file: File, onProgress?: (percent: number) => void) {
  const { data: { session }, error } = await createClient().auth.getSession();
  if (error || !session) throw new Error("Session expired. Sign in again before uploading.");

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${baseUrl}/storage/v1/object/property-media/${path.split("/").map(encodeURIComponent).join("/")}`);
    request.timeout = 10 * 60 * 1000;
    request.setRequestHeader("apikey", apiKey);
    request.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    request.setRequestHeader("Content-Type", file.type || "video/mp4");
    request.setRequestHeader("cache-control", "max-age=3600");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    request.onerror = () => reject(new Error("Video upload lost its connection. Check your network and try again."));
    request.ontimeout = () => reject(new Error("Video upload timed out. Check your connection and try again."));
    request.onabort = () => reject(new Error("Video upload was cancelled."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        let message = `Video upload failed (HTTP ${request.status}).`;
        try {
          const body = JSON.parse(request.responseText);
          message = body.message || body.error || message;
        } catch { /* Keep the HTTP error when Storage returns a non-JSON response. */ }
        reject(new Error(message));
      }
    };
    onProgress?.(0);
    request.send(file);
  });
}
