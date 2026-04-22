-- Hard fix for public listing visibility:
-- 1) Ensure anon/authenticated roles have SELECT grants.
-- 2) Ensure RLS policies allow active + approved + non-deleted listings
--    regardless of ownership/safety workflow state.

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

-- Explicit grants (required in addition to RLS policies).
GRANT SELECT ON TABLE public.properties TO anon, authenticated;
GRANT SELECT ON TABLE public.property_images TO anon, authenticated;
GRANT SELECT ON TABLE public.property_videos TO anon, authenticated;
GRANT SELECT ON TABLE public.cities TO anon, authenticated;
GRANT SELECT ON TABLE public.localities TO anon, authenticated;
GRANT SELECT ON TABLE public.states TO anon, authenticated;

-- Properties visibility policy
DROP POLICY IF EXISTS "public_read_active_approved_properties" ON public.properties;
DROP POLICY IF EXISTS "public_read_non_deleted_properties" ON public.properties;
DROP POLICY IF EXISTS "anon_read_public_active_properties" ON public.properties;
DROP POLICY IF EXISTS "public_read_properties_active_approved_non_deleted" ON public.properties;
CREATE POLICY "public_read_properties_active_approved_non_deleted"
  ON public.properties
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND verification_status = 'approved'
    AND deleted_at IS NULL
  );

-- Property images visibility policy
DROP POLICY IF EXISTS "public_read_property_images_for_active_approved" ON public.property_images;
DROP POLICY IF EXISTS "public_read_property_images_for_non_deleted" ON public.property_images;
DROP POLICY IF EXISTS "public_read_property_images_for_visible_properties" ON public.property_images;
CREATE POLICY "public_read_property_images_for_visible_properties"
  ON public.property_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_images.property_id
        AND p.status = 'active'
        AND p.verification_status = 'approved'
        AND p.deleted_at IS NULL
    )
  );

-- Property videos visibility policy
DROP POLICY IF EXISTS "public_read_property_videos_for_active_approved" ON public.property_videos;
DROP POLICY IF EXISTS "public_read_property_videos_for_non_deleted" ON public.property_videos;
DROP POLICY IF EXISTS "public_read_property_videos_for_visible_properties" ON public.property_videos;
CREATE POLICY "public_read_property_videos_for_visible_properties"
  ON public.property_videos
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_videos.property_id
        AND p.status = 'active'
        AND p.verification_status = 'approved'
        AND p.deleted_at IS NULL
    )
  );

-- Location lookup policies used in listing joins/search filters
DROP POLICY IF EXISTS "public_read_cities" ON public.cities;
DROP POLICY IF EXISTS "anon_read_cities" ON public.cities;
CREATE POLICY "public_read_cities"
  ON public.cities
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_localities" ON public.localities;
DROP POLICY IF EXISTS "anon_read_localities" ON public.localities;
CREATE POLICY "public_read_localities"
  ON public.localities
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public_read_states" ON public.states;
DROP POLICY IF EXISTS "anon_read_states" ON public.states;
CREATE POLICY "public_read_states"
  ON public.states
  FOR SELECT
  TO anon, authenticated
  USING (true);
