import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

/* ======================================================
   HELPERS
====================================================== */

function isValidPath(path: string) {
  return typeof path === "string" && path.length > 0;
}

async function removeWithRetry(
  bucket: string,
  paths: string[],
  retries = 2
): Promise<boolean> {

  for (let attempt = 0; attempt <= retries; attempt++) {

    const { error } = await supabase.storage
      .from(bucket)
      .remove(paths);

    if (!error) return true;

    console.warn(
      `Storage delete attempt ${attempt + 1} failed:`,
      error.message
    );

    if (attempt === retries) return false;
  }

  return false;
}

/* ======================================================
   DELETE SINGLE FILE
====================================================== */

export async function deleteImage(
  bucket: string,
  path: string
): Promise<boolean> {

  if (!isValidPath(path)) return false;

  return await removeWithRetry(bucket, [path]);
}

/* ======================================================
   DELETE MULTIPLE FILES
====================================================== */

export async function deleteImages(
  bucket: string,
  paths: string[]
): Promise<boolean> {

  if (!paths || paths.length === 0) return false;

  const validPaths = paths.filter(isValidPath);

  if (validPaths.length === 0) return false;

  return await removeWithRetry(bucket, validPaths);
}

/* ======================================================
   INTERNAL → RECURSIVE LIST
====================================================== */

async function listAllFilesRecursive(
  bucket: string,
  folder: string
): Promise<string[]> {

  let allPaths: string[] = [];

  const { data: items, error } =
    await supabase.storage
      .from(bucket)
      .list(folder, { limit: 100 });

  if (error || !items) {
    console.warn("List error:", error?.message);
    return [];
  }

  for (const item of items) {

    const fullPath = `${folder}/${item.name}`;

    /* if folder → recurse */
    if (!item.id) {
      const nested =
        await listAllFilesRecursive(bucket, fullPath);
      allPaths = [...allPaths, ...nested];
    } else {
      allPaths.push(fullPath);
    }
  }

  return allPaths;
}

/* ======================================================
   DELETE PROPERTY MEDIA (FULL RECURSIVE)
====================================================== */

export async function deletePropertyMedia(
  propertyId: string
): Promise<boolean> {

  if (!propertyId) return false;

  const bucket = "property-media";

  try {

    const allFiles =
      await listAllFilesRecursive(bucket, propertyId);

    if (!allFiles.length) return true;

    return await removeWithRetry(bucket, allFiles);

  } catch (err) {

    console.warn(
      "Property media deletion failed:",
      err
    );

    return false;
  }
}