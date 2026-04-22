-- Public visibility for listing pages, homepage cards, and property detail pages.
-- Allows anonymous users to read active & verified properties and supporting location/media rows.

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.localities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_public_active_properties" ON public.properties;
CREATE POLICY "anon_read_public_active_properties"
  ON public.properties
  FOR SELECT
  TO anon
  USING (
    status = 'active'
    AND ownership_verified = true
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "anon_read_property_images" ON public.property_images;
CREATE POLICY "anon_read_property_images"
  ON public.property_images
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_images.property_id
        AND p.status = 'active'
        AND p.ownership_verified = true
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "anon_read_property_videos" ON public.property_videos;
CREATE POLICY "anon_read_property_videos"
  ON public.property_videos
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = property_videos.property_id
        AND p.status = 'active'
        AND p.ownership_verified = true
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "anon_read_cities" ON public.cities;
CREATE POLICY "anon_read_cities"
  ON public.cities
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_read_localities" ON public.localities;
CREATE POLICY "anon_read_localities"
  ON public.localities
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_read_states" ON public.states;
CREATE POLICY "anon_read_states"
  ON public.states
  FOR SELECT
  TO anon
  USING (true);
