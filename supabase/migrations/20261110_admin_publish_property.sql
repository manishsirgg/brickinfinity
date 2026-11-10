-- Narrow admin-only publishing operation, independent of seller UPDATE policies.
CREATE OR REPLACE FUNCTION public.admin_publish_property(p_property_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  published_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid() AND u.role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only an authenticated admin can publish properties.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.properties
  SET status = 'active',
      ownership_verified = true,
      verification_status = 'approved',
      rejection_reason = NULL,
      approved_at = now()
  WHERE id = p_property_id
    AND status = 'pending'
    AND ownership_verified = true
    AND verification_status IN ('ownership_approved', 'approved')
    AND deleted_at IS NULL
  RETURNING id INTO published_id;

  IF published_id IS NULL THEN
    RAISE EXCEPTION 'Property is no longer pending review or ownership has not been approved.';
  END IF;

  RETURN published_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_publish_property(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_property(uuid) TO authenticated;
