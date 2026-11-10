-- Save/replace a video's listing record without relying on missing table write policies.
-- Storage upload policies remain enforced separately.
CREATE OR REPLACE FUNCTION public.save_property_video(p_property_id uuid, p_video_url text)
RETURNS TABLE(id uuid, video_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Lock the property so concurrent replacements cannot leave multiple videos.
  PERFORM 1 FROM public.properties p
  WHERE p.id = p_property_id AND p.deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
        AND (u.id = p.seller_id OR u.role::text = 'admin')
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the property owner or an admin can save this video.' USING ERRCODE = '42501';
  END IF;

  IF p_video_url IS NULL OR p_video_url NOT LIKE 'https://%/storage/v1/object/public/property-media/' || p_property_id::text || '/video/%' THEN
    RAISE EXCEPTION 'Video must be uploaded to this property media folder.';
  END IF;

  -- Both statements commit together; a failed insert preserves the previous video.
  DELETE FROM public.property_videos v WHERE v.property_id = p_property_id;
  RETURN QUERY
    INSERT INTO public.property_videos AS v (property_id, video_url)
    VALUES (p_property_id, p_video_url)
    RETURNING v.id, v.video_url;
END;
$$;

REVOKE ALL ON FUNCTION public.save_property_video(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_property_video(uuid, text) TO authenticated;
