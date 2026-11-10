# Deploying the admin property publishing fix

Apply `supabase/migrations/20261110_admin_publish_property.sql` to the application's Supabase database before deploying the updated app. Use the project's normal migration process or run the migration in the Supabase SQL editor. No service-role key is required by the browser.

The function permits only authenticated users whose `public.users.user_id` matches `auth.uid()` and whose role is `admin`. It publishes only pending, non-deleted properties with approved ownership. It returns the updated property ID; denied or stale requests produce an error rather than a false success. Existing seller policies are unchanged.

Run `node scripts/validate-admin-publish.mjs` for the page's success and failure regression checks and `npx tsc --noEmit` for type checking. The migration was also exercised in an isolated PostgreSQL-compatible PGlite database with row-level security enabled: anonymous, missing-session and seller calls were denied; an admin published successfully; repeated publication, unverified ownership and deleted listings were rejected.

After deployment, sign in as an admin, select a pending ownership-approved listing, and click Publish Now. Confirm the success message, removal from the queue, and public listing visibility. Database errors must keep the property selected and show an alert. This authenticated production check was not performed in the development environment.
