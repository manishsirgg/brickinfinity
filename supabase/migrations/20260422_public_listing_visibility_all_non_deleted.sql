-- Make all non-deleted property listings and details publicly visible.
-- Login should only be required for actions (save, lead form submit, upgrades, etc.).

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

-- Properties: any non-deleted listing should be publicly readable.
DROP POLICY IF EXISTS "anon_read_public_active_properties" ON public.properties;
DROP POLICY IF EXISTS "public_read_active_approved_properties" ON public.properties;
DROP POLICY IF EXISTS "public_read_non_deleted_properties" ON public.properties;
CREATE POLICY "public_read_non_deleted_properties"
  ON public.properties
  FOR SELECT
  TO public
  USING (deleted_at IS NULL);

-- Media rows should be readable when parent listing is non-deleted.
DROP POLICY IF EXISTS "anon_read_property_images" ON public.property_images;
DROP POLICY IF EXISTS "public_read_property_images_for_active_approved" ON public.property_images;
DROP POLICY IF EXISTS "public_read_property_images_for_non_deleted" ON public.property_images;
CREATE POLICY "public_read_property_images_for_non_deleted"
  ON public.property_images
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_images.property_id
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "anon_read_property_videos" ON public.property_videos;
DROP POLICY IF EXISTS "public_read_property_videos_for_active_approved" ON public.property_videos;
DROP POLICY IF EXISTS "public_read_property_videos_for_non_deleted" ON public.property_videos;
CREATE POLICY "public_read_property_videos_for_non_deleted"
  ON public.property_videos
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_videos.property_id
        AND p.deleted_at IS NULL
    )
  );

-- Location references used in joins should be publicly readable.
DROP POLICY IF EXISTS "anon_read_cities" ON public.cities;
DROP POLICY IF EXISTS "public_read_cities" ON public.cities;
CREATE POLICY "public_read_cities"
  ON public.cities
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "anon_read_localities" ON public.localities;
DROP POLICY IF EXISTS "public_read_localities" ON public.localities;
CREATE POLICY "public_read_localities"
  ON public.localities
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "anon_read_states" ON public.states;
DROP POLICY IF EXISTS "public_read_states" ON public.states;
CREATE POLICY "public_read_states"
  ON public.states
  FOR SELECT
  TO public
  USING (true);
