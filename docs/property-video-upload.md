# Deploying video upload and progress

Before deploying the app, apply `supabase/migrations/20261110_save_property_video.sql` through the normal Supabase migration process or SQL editor. It installs `save_property_video(uuid, text)`, which verifies the authenticated property owner or admin, rejects deleted properties and mismatched video paths, and replaces the listing's video record atomically. It does not disable RLS or change Storage policies.

The screenshot's `new row violates row-level security policy for table "property_videos"` occurs after Storage upload. Both add and edit pages now use this function instead of directly inserting into the blocked table. Existing Storage upload permissions are still required.

The edit page displays byte-transfer percentage via XMLHttpRequest upload events. At 100%, it separately reports that the listing is being saved. Permission, connection and timeout failures remain visible, and retrying a database save in the same page reuses the uploaded video's URL rather than transferring the file again.

Validation: `node scripts/validate-video-upload.mjs`, `npx tsc --noEmit`, targeted ESLint, isolated PGlite permission/replacement checks, and Chromium UI progress checks with a simulated backend. Live production uploads were not performed.

After migration and deployment, upload a video as a property owner, confirm progress and successful saving, reload the edit page, and verify public playback. Repeat replacement as an admin and ensure the previous video record is replaced.
