CREATE OR REPLACE FUNCTION public.seller_crm_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
SELECT u.id
FROM public.users u
WHERE u.user_id = auth.uid()
ORDER BY u.created_at DESC NULLS LAST
LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.seller_crm_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
SELECT COALESCE(
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_id = auth.uid()
      AND lower(coalesce(u.role::text, '')) IN ('admin', 'super_admin')
  ),
  false
)
$$;

CREATE OR REPLACE FUNCTION public.seller_crm_can_access_seller(p_seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
SELECT COALESCE(public.seller_crm_is_admin(), false)
  OR (
    p_seller_id IS NOT NULL
    AND public.seller_crm_current_user_id() IS NOT NULL
    AND p_seller_id = public.seller_crm_current_user_id()
  )
$$;
