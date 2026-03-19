import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* ======================================================
   GENERIC SINGLE FILE UPLOAD (AVATAR / KYC / ETC)
====================================================== */

export async function uploadImage({
  file,
  bucket,
  folder,
  maxSizeMB = 1,
}: {
  file: File;
  bucket: string;
  folder: string;
  maxSizeMB?: number;
}) {

  const compressed = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: 1200,
    useWebWorker: true,
  });

  const filename =
    `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "-")}`;

  const path = `${folder}/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, compressed);

  if (error) throw error;

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return {
    path,
    url: data.publicUrl,
  };
}

/* ======================================================
   PROPERTY MEDIA UPLOAD SYSTEM (NEW)
====================================================== */

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadPropertyMedia({
  propertyId,
  images,
  video,
}: {
  propertyId: string;
  images: File[];
  video?: File | null;
}) {

  const uploadedImages: string[] = [];
  let uploadedVideo: string | null = null;

  const bucket = "property-media";

  /* IMAGE UPLOAD */

  for (let i = 0; i < images.length; i++) {

    const img = images[i];

    const compressed = await imageCompression(img, {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
    });

    const filename = sanitizeFileName(
      `img-${Date.now()}-${i}.jpg`
    );

    const path = `${propertyId}/images/${filename}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, compressed);

    if (error) throw error;

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    uploadedImages.push(data.publicUrl);
  }

  /* VIDEO UPLOAD */

  if (video) {

    const filename = sanitizeFileName(
      `video-${Date.now()}-${video.name}`
    );

    const path = `${propertyId}/video/${filename}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, video);

    if (error) throw error;

    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    uploadedVideo = data.publicUrl;
  }

  return {
    images: uploadedImages,
    video: uploadedVideo,
  };
}