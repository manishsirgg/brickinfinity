BEGIN;

-- Older deployment triggers can use unqualified public table names (documents,
-- properties, users). They inherit the calling function's search_path unless
-- they declare their own. The owner-only write workflows previously passed an
-- empty path to those triggers, causing a review to roll back with 42P01.
-- Keep built-ins first and temporary objects last. Public must remain a trusted
-- schema: ordinary API users must never create objects in a definer's path.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.review_property_ownership(uuid, boolean, jsonb, text)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.review_identity_document(uuid, boolean, text)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.declare_owner_identity(text, boolean)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.admin_publish_property(uuid)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.confirm_property_availability(uuid)
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION public.manage_staff_admin(uuid, boolean)
  SET search_path TO pg_catalog, public, pg_temp;

-- These nested write triggers must also preserve the compatible path when
-- changing documents/properties/users and firing older triggers in turn.
ALTER FUNCTION brick_private.account_changed()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION brick_private.media_changed()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION brick_private.evidence_resubmitted()
  SET search_path TO pg_catalog, public, pg_temp;
ALTER FUNCTION brick_private.reopen_owner_evidence()
  SET search_path TO pg_catalog, public, pg_temp;

COMMIT;
