BEGIN;

-- Changing listing capacity invalidates property evidence through the existing
-- account_changed trigger. It must not revoke an already-active, verified
-- seller's account access merely because a legacy trigger recalculates status.
CREATE OR REPLACE FUNCTION public.declare_owner_identity(p_identity text,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE
  before_account public.users%ROWTYPE;
  after_account public.users%ROWTYPE;
  preserve_active boolean;
  first_activation boolean;
BEGIN
  IF auth.uid() IS NULL OR p_accept IS DISTINCT FROM true OR p_identity IS NULL
    OR p_identity NOT IN ('owner','project_owner_builder') THEN
    RAISE EXCEPTION 'Accept the owner-only, no-agent declaration.';
  END IF;
  SELECT * INTO before_account FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR before_account.role::text='admin' THEN
    RAISE EXCEPTION 'Profile not found or declaration not needed.';
  END IF;
  preserve_active := before_account.role::text='seller'
    AND before_account.seller_status::text='active'
    AND before_account.kyc_status::text='approved'
    AND brick_private.identity_evidence_ready(before_account.id);
  -- A fresh applicant may finish onboarding after identity approval. A
  -- previously declared, inactive/demoted account requires staff review.
  first_activation := before_account.role::text='buyer'
    AND before_account.owner_declaration_at IS NULL
    AND before_account.seller_status::text IN ('basic','pending_seller')
    AND before_account.kyc_status::text='approved'
    AND brick_private.identity_evidence_ready(before_account.id)
    AND NOT EXISTS(SELECT 1 FROM public.account_security_events e
      WHERE e.user_id=before_account.id AND e.actor_auth_id IS DISTINCT FROM before_account.user_id
      AND e.action='account_permissions_changed' AND e.details->>'old_role' IN ('seller','admin')
      AND e.details->>'new_role'='buyer');

  after_account := before_account;
  IF first_activation THEN after_account.role:='seller'; after_account.seller_status:='active'; END IF;
  UPDATE public.users SET seller_identity=p_identity,owner_declaration_at=now(),
    role=after_account.role,seller_status=after_account.seller_status
  WHERE id=before_account.id;

  IF preserve_active OR first_activation THEN
    SELECT * INTO after_account FROM public.users WHERE id=before_account.id;
    IF NOT brick_private.identity_evidence_ready(before_account.id) THEN
      RAISE EXCEPTION 'Identity evidence changed during the declaration update. No declaration change was saved; refresh and request identity review.';
    END IF;
    IF after_account.role::text<>'seller' OR after_account.seller_status::text<>'active'
       OR after_account.kyc_status::text<>'approved' THEN
      UPDATE public.users SET role='seller',seller_status='active',kyc_status='approved'
      WHERE id=before_account.id;
    END IF;
    SELECT * INTO after_account FROM public.users WHERE id=before_account.id;
    IF after_account.role::text<>'seller' OR after_account.seller_status::text<>'active'
       OR after_account.kyc_status::text<>'approved' THEN
      RAISE EXCEPTION 'A conflicting account trigger prevented preserving verified seller access. No declaration change was saved; contact an admin.';
    END IF;
  END IF;
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
  VALUES(auth.uid(),before_account.id,'owner_declaration_recorded',jsonb_build_object(
    'identity',p_identity,'old_identity',before_account.seller_identity,'no_agent',true,
    'policy_version','owner-only-v1','active_access_preserved',preserve_active));
END $$;

-- Recovery for already-affected accounts. Unlike the old role-only admin
-- promotion, this checks current evidence and updates both dashboard gates.
CREATE OR REPLACE FUNCTION public.admin_activate_verified_seller(p_user_id uuid,p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE target public.users%ROWTYPE;
BEGIN
  IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Staff admin access required.' USING ERRCODE='42501'; END IF;
  IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'A seller activation review note is required.'; END IF;
  SELECT * INTO target FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR target.role::text='admin' THEN RAISE EXCEPTION 'A non-admin account is required.'; END IF;
  IF target.kyc_status::text<>'approved' OR NOT brick_private.identity_evidence_ready(target.id)
    OR target.owner_declaration_at IS NULL OR target.seller_identity IS NULL
    OR target.seller_identity NOT IN ('owner','project_owner_builder') THEN
    RAISE EXCEPTION 'Approved government ID and selfie files plus an owner-only declaration are required before seller activation.';
  END IF;
  UPDATE public.users SET role='seller',seller_status='active' WHERE id=target.id;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=target.id AND role::text='seller'
    AND seller_status::text='active' AND kyc_status::text='approved') THEN
    RAISE EXCEPTION 'A conflicting account trigger prevented activation. No activation was saved.';
  END IF;
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
  VALUES(auth.uid(),target.id,'seller_activation_reviewed',jsonb_build_object('note',trim(p_note),'old_role',target.role,'old_seller_status',target.seller_status));
END $$;
REVOKE ALL ON FUNCTION public.declare_owner_identity(text,boolean),public.admin_activate_verified_seller(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.declare_owner_identity(text,boolean),public.admin_activate_verified_seller(uuid,text) TO authenticated;
COMMIT;
