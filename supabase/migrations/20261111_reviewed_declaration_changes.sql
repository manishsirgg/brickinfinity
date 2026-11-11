BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS declaration_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS seller_legal_name text;
CREATE TEMP TABLE brick_declaration_access_before ON COMMIT DROP AS
 SELECT id,role::text AS role,kyc_status::text AS kyc_status,seller_status::text AS seller_status,seller_identity FROM public.users;
CREATE TEMP TABLE brick_declaration_listings_before ON COMMIT DROP AS
 SELECT id,status::text AS status,verification_status::text AS verification_status,ownership_verified,
  ownership_review_status,ownership_reviewed_at,identity_reviewed_at,listing_reviewed_at FROM public.properties;
-- Verification is a sticky boundary: setting KYC pending later cannot reopen
-- unrestricted declaration editing. Existing reviewed accounts are locked too.
UPDATE public.users u SET declaration_locked_at=now() WHERE declaration_locked_at IS NULL AND (
  u.kyc_status::text='approved' OR u.role::text IN ('seller','admin') OR brick_private.identity_evidence_ready(u.id) OR
  EXISTS(SELECT 1 FROM public.account_security_events e WHERE e.user_id=u.id AND
    (e.details->>'old_kyc'='approved' OR e.details->>'new_kyc'='approved' OR e.details->>'old_role' IN ('seller','admin') OR e.details->>'new_role' IN ('seller','admin'))));
-- Some deployments have legacy triggers on every profile update. Abort the
-- whole migration rather than silently changing access or published inventory.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.brick_declaration_access_before b JOIN public.users u ON u.id=b.id
   WHERE ROW(u.role::text,u.kyc_status::text,u.seller_status::text,u.seller_identity) IS DISTINCT FROM ROW(b.role,b.kyc_status,b.seller_status,b.seller_identity))
 OR EXISTS(SELECT 1 FROM pg_temp.brick_declaration_listings_before b JOIN public.properties p ON p.id=b.id
   WHERE ROW(p.status::text,p.verification_status::text,p.ownership_verified,p.ownership_review_status,p.ownership_reviewed_at,p.identity_reviewed_at,p.listing_reviewed_at)
    IS DISTINCT FROM ROW(b.status,b.verification_status,b.ownership_verified,b.ownership_review_status,b.ownership_reviewed_at,b.identity_reviewed_at,b.listing_reviewed_at)) THEN
  RAISE EXCEPTION 'A legacy trigger changed account access or listing review during declaration locking. Migration rolled back; inspect the legacy triggers before retrying.';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION brick_private.guard_declaration_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF TG_OP='INSERT' THEN
   IF NEW.declaration_locked_at IS NOT NULL OR NEW.seller_legal_name IS NOT NULL THEN RAISE EXCEPTION 'Declaration verification fields require admin review.'; END IF;
  ELSIF NEW.declaration_locked_at IS DISTINCT FROM OLD.declaration_locked_at OR NEW.seller_legal_name IS DISTINCT FROM OLD.seller_legal_name OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity THEN
   RAISE EXCEPTION 'Use the reviewed declaration workflow.' USING ERRCODE='42501';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.declaration_locked_at IS NOT NULL THEN NEW.declaration_locked_at:=OLD.declaration_locked_at; END IF;
 IF NEW.kyc_status::text='approved' OR NEW.role::text IN ('seller','admin') THEN NEW.declaration_locked_at:=coalesce(NEW.declaration_locked_at,now()); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_declaration_lock ON public.users;
CREATE TRIGGER zz_guard_declaration_lock BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION brick_private.guard_declaration_lock();

CREATE TABLE IF NOT EXISTS public.declaration_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.users(id),
 from_identity text NOT NULL CHECK(from_identity IN ('owner','project_owner_builder')),
 requested_identity text NOT NULL CHECK(requested_identity IN ('owner','project_owner_builder')),
 requested_legal_name text NOT NULL CHECK(length(trim(requested_legal_name)) BETWEEN 1 AND 200),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 10 AND 2000),
 evidence_paths text[] NOT NULL CHECK(cardinality(evidence_paths) BETWEEN 1 AND 5),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
 review_note text,review_checks jsonb,reviewer_auth_id uuid,reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(from_identity<>requested_identity)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_declaration_change ON public.declaration_change_requests(user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS declaration_change_history ON public.declaration_change_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS declaration_change_evidence_paths ON public.declaration_change_requests USING gin(evidence_paths);
ALTER TABLE public.declaration_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.declaration_change_requests FROM anon,authenticated;
GRANT SELECT ON public.declaration_change_requests TO authenticated;
DROP POLICY IF EXISTS read_own_declaration_requests ON public.declaration_change_requests;
CREATE POLICY read_own_declaration_requests ON public.declaration_change_requests FOR SELECT TO authenticated
 USING(brick_private.is_admin() OR user_id::text=brick_private.actor()->>'id');

-- Shared trusted mutation. Preserve access flags exactly during capacity changes;
-- the existing account_changed trigger separately invalidates property evidence.
CREATE OR REPLACE FUNCTION brick_private.apply_declared_identity(p_user uuid,p_identity text,p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE before_account public.users%ROWTYPE;target public.users%ROWTYPE;first_activation boolean;
BEGIN
 IF p_identity IS NULL OR p_identity NOT IN ('owner','project_owner_builder') THEN RAISE EXCEPTION 'Owner-only capacity required.'; END IF;
 SELECT * INTO before_account FROM public.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR before_account.role::text='admin' THEN RAISE EXCEPTION 'A non-admin profile is required.'; END IF;
 target:=before_account;
 first_activation:=before_account.role::text='buyer' AND before_account.owner_declaration_at IS NULL
   AND before_account.seller_status::text IN ('basic','pending_seller') AND before_account.kyc_status::text='approved'
   AND brick_private.identity_evidence_ready(before_account.id)
   AND NOT EXISTS(SELECT 1 FROM public.account_security_events e WHERE e.user_id=before_account.id
    AND e.actor_auth_id IS DISTINCT FROM before_account.user_id AND e.action='account_permissions_changed'
    AND e.details->>'old_role' IN ('seller','admin') AND e.details->>'new_role'='buyer');
 IF first_activation THEN target.role:='seller';target.seller_status:='active'; END IF;
 UPDATE public.users SET seller_identity=p_identity,seller_legal_name=p_name,owner_declaration_at=now(),role=target.role,seller_status=target.seller_status WHERE id=p_user;
 -- Protect against legacy status-only recalculation. No admin restriction can
 -- be lifted: target flags came from the locked row, except first onboarding.
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND role IS NOT DISTINCT FROM target.role
   AND seller_status IS NOT DISTINCT FROM target.seller_status AND kyc_status IS NOT DISTINCT FROM target.kyc_status) THEN
  IF target.kyc_status::text='approved' AND NOT brick_private.identity_evidence_ready(p_user) THEN RAISE EXCEPTION 'Identity evidence changed; no declaration update was saved.'; END IF;
  UPDATE public.users SET role=target.role,seller_status=target.seller_status,kyc_status=target.kyc_status WHERE id=p_user;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND role IS NOT DISTINCT FROM target.role
   AND seller_status IS NOT DISTINCT FROM target.seller_status AND kyc_status IS NOT DISTINCT FROM target.kyc_status) THEN
  RAISE EXCEPTION 'A conflicting account trigger prevented preserving access. No declaration update was saved.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION brick_private.apply_declared_identity(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.declare_owner_identity(p_identity text,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_accept IS DISTINCT FROM true OR p_identity IS NULL OR p_identity NOT IN ('owner','project_owner_builder') THEN RAISE EXCEPTION 'Accept the owner-only, no-agent declaration.'; END IF;
 SELECT * INTO u FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR u.role::text='admin' THEN RAISE EXCEPTION 'Profile not found or declaration not needed.'; END IF;
 IF u.declaration_locked_at IS NOT NULL AND u.seller_identity IS NOT NULL AND u.seller_identity<>p_identity THEN
  RAISE EXCEPTION 'Your verified declaration is locked. Submit a declaration change request for admin review.' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM public.declaration_change_requests WHERE user_id=u.id AND status='pending') THEN RAISE EXCEPTION 'A declaration change is pending. Cancel it before changing your declaration.'; END IF;
 PERFORM brick_private.apply_declared_identity(u.id,p_identity,u.seller_legal_name);
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),u.id,'owner_declaration_recorded',jsonb_build_object('identity',p_identity,'no_agent',true,'policy_version','owner-only-v2'));
END $$;

CREATE OR REPLACE FUNCTION brick_private.declaration_files_present(p_paths text[],p_auth uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(cardinality(p_paths) BETWEEN 1 AND 5,false)
 AND (SELECT count(DISTINCT path) FROM unnest(p_paths) path)=cardinality(p_paths)
 AND NOT EXISTS(SELECT 1 FROM unnest(p_paths) path WHERE path IS NULL OR split_part(path,'/',1) IS DISTINCT FROM p_auth::text
  OR path ~ '(^|/)\.\.(/|$)' OR NOT EXISTS(SELECT 1 FROM storage.objects f WHERE f.bucket_id='declaration-documents' AND f.name=path))
$$;
REVOKE ALL ON FUNCTION brick_private.declaration_files_present(text[],uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.submit_declaration_change(p_identity text,p_legal_name text,p_reason text,p_accept boolean,p_evidence_paths text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE u public.users%ROWTYPE;request_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_accept IS DISTINCT FROM true OR p_identity IS NULL OR p_identity NOT IN ('owner','project_owner_builder') THEN RAISE EXCEPTION 'Accept the owner-only declaration for a permitted capacity.'; END IF;
 IF nullif(trim(p_legal_name),'') IS NULL OR length(trim(p_legal_name))>200 OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Provide a legal owner/company name and a change reason of 10–2000 characters.'; END IF;
 SELECT * INTO u FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR u.role::text='admin' OR u.seller_identity IS NULL OR u.declaration_locked_at IS NULL THEN RAISE EXCEPTION 'A previously verified declaration is required; unverified applicants can edit their declaration directly.'; END IF;
 IF u.seller_identity=p_identity THEN RAISE EXCEPTION 'Choose a different capacity for the change request.'; END IF;
 IF EXISTS(SELECT 1 FROM public.declaration_change_requests WHERE user_id=u.id AND status='pending') THEN RAISE EXCEPTION 'A declaration change request is already pending.'; END IF;
 PERFORM id FROM storage.objects WHERE bucket_id='declaration-documents' AND name=ANY(p_evidence_paths) ORDER BY name FOR KEY SHARE;
 IF NOT brick_private.declaration_files_present(p_evidence_paths,auth.uid()) THEN RAISE EXCEPTION 'Upload 1–5 private supporting files belonging to your account before submitting.'; END IF;
 INSERT INTO public.declaration_change_requests(user_id,from_identity,requested_identity,requested_legal_name,reason,evidence_paths)
 VALUES(u.id,u.seller_identity,p_identity,trim(p_legal_name),trim(p_reason),p_evidence_paths) RETURNING id INTO request_id;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),u.id,'declaration_change_requested',jsonb_build_object('request_id',request_id,'from',u.seller_identity,'to',p_identity));
 RETURN request_id;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_declaration_change(p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE uid uuid;
BEGIN
 SELECT id INTO uid FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to your account.'; END IF;
 UPDATE public.declaration_change_requests SET status='cancelled',reviewed_at=now(),review_note='Cancelled by the applicant.' WHERE id=p_request_id AND user_id=uid AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Your pending request was not found.'; END IF;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),uid,'declaration_change_cancelled',jsonb_build_object('request_id',p_request_id));
END $$;

CREATE OR REPLACE FUNCTION public.review_declaration_change(p_request_id uuid,p_approve boolean,p_checks jsonb,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE r public.declaration_change_requests%ROWTYPE;u public.users%ROWTYPE;uid uuid;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Staff admin access required.' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR nullif(trim(p_note),'') IS NULL OR length(p_note)>4000 THEN RAISE EXCEPTION 'A review decision and note are required.'; END IF;
 IF p_checks IS NOT NULL AND jsonb_typeof(p_checks)<>'object' THEN RAISE EXCEPTION 'Review checks must be an object.'; END IF;
 SELECT user_id INTO uid FROM public.declaration_change_requests WHERE id=p_request_id;
 IF uid IS NULL THEN RAISE EXCEPTION 'Request not found.'; END IF;
 -- Match submission/cancellation lock order to serialize decisions safely.
 SELECT * INTO u FROM public.users WHERE id=uid FOR UPDATE;
 SELECT * INTO r FROM public.declaration_change_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' THEN RAISE EXCEPTION 'This request has already been decided or cancelled.'; END IF;
 IF u.user_id=auth.uid() OR u.role::text='admin' THEN RAISE EXCEPTION 'An admin cannot review their own declaration.'; END IF;
 IF p_approve THEN
  IF u.seller_identity IS DISTINCT FROM r.from_identity THEN RAISE EXCEPTION 'The effective declaration has changed. Reject this stale request and ask for a new one.'; END IF;
  IF u.kyc_status::text<>'approved' OR NOT brick_private.identity_evidence_ready(u.id) THEN RAISE EXCEPTION 'Current approved government ID and selfie files are required.'; END IF;
  PERFORM id FROM storage.objects WHERE bucket_id='declaration-documents' AND name=ANY(r.evidence_paths) ORDER BY name FOR KEY SHARE;
  IF NOT brick_private.declaration_files_present(r.evidence_paths,u.user_id) THEN RAISE EXCEPTION 'Supporting evidence is missing; approval was not saved.'; END IF;
  IF NOT coalesce(p_checks @> '{"identity_matches":true,"capacity_supported":true,"no_agent":true}'::jsonb,false) THEN RAISE EXCEPTION 'Complete every declaration review check.'; END IF;
  PERFORM brick_private.apply_declared_identity(u.id,r.requested_identity,r.requested_legal_name);
  IF NOT brick_private.identity_evidence_ready(u.id) THEN RAISE EXCEPTION 'Identity evidence changed; approval was not saved.'; END IF;
 END IF;
 UPDATE public.declaration_change_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  review_note=trim(p_note),review_checks=coalesce(p_checks,'{}'::jsonb) || jsonb_build_object(
    'identity_evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',d.id,'document_type',d.document_type,'document_path',d.document_url,'status',d.status))
      FROM (SELECT DISTINCT ON(document_type) id,document_type,document_url,status FROM public.documents WHERE user_id=u.id AND property_id IS NULL ORDER BY document_type,created_at DESC,id DESC) d),'[]'::jsonb),
    'account_access_at_review',jsonb_build_object('role',u.role,'seller_status',u.seller_status,'kyc_status',u.kyc_status)),
  reviewer_auth_id=auth.uid(),reviewed_at=now() WHERE id=r.id;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),u.id,'declaration_change_reviewed',jsonb_build_object('request_id',r.id,'approved',p_approve,'note',trim(p_note)));
END $$;
REVOKE ALL ON FUNCTION public.declare_owner_identity(text,boolean),public.submit_declaration_change(text,text,text,boolean,text[]),public.cancel_declaration_change(uuid),public.review_declaration_change(uuid,boolean,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.declare_owner_identity(text,boolean),public.submit_declaration_change(text,text,text,boolean,text[]),public.cancel_declaration_change(uuid),public.review_declaration_change(uuid,boolean,jsonb,text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('declaration-documents','declaration-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760,allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png'];
CREATE OR REPLACE FUNCTION brick_private.declaration_evidence_referenced(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.declaration_change_requests WHERE evidence_paths @> ARRAY[p_path])
$$;
REVOKE ALL ON FUNCTION brick_private.declaration_evidence_referenced(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION brick_private.declaration_evidence_referenced(text) TO authenticated;
CREATE OR REPLACE FUNCTION brick_private.declaration_identity_evidence_referenced(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.declaration_change_requests r,
   jsonb_array_elements(coalesce(r.review_checks->'identity_evidence','[]'::jsonb)) e WHERE e->>'document_path'=p_path)
$$;
REVOKE ALL ON FUNCTION brick_private.declaration_identity_evidence_referenced(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION brick_private.declaration_identity_evidence_referenced(text) TO authenticated;
DROP POLICY IF EXISTS retain_declaration_identity_update ON storage.objects;
CREATE POLICY retain_declaration_identity_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'identity-documents' OR NOT brick_private.declaration_identity_evidence_referenced(name))
 WITH CHECK(bucket_id<>'identity-documents' OR NOT brick_private.declaration_identity_evidence_referenced(name));
DROP POLICY IF EXISTS retain_declaration_identity_delete ON storage.objects;
CREATE POLICY retain_declaration_identity_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'identity-documents' OR NOT brick_private.declaration_identity_evidence_referenced(name));
DROP POLICY IF EXISTS declaration_evidence_no_anon ON storage.objects;
CREATE POLICY declaration_evidence_no_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'declaration-documents') WITH CHECK(bucket_id<>'declaration-documents');
DROP POLICY IF EXISTS declaration_evidence_scope ON storage.objects;
CREATE POLICY declaration_evidence_scope ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id<>'declaration-documents' OR brick_private.is_admin() OR split_part(name,'/',1)=auth.uid()::text)
 WITH CHECK(bucket_id<>'declaration-documents' OR split_part(name,'/',1)=auth.uid()::text);
DROP POLICY IF EXISTS declaration_evidence_allow ON storage.objects;
CREATE POLICY declaration_evidence_allow ON storage.objects FOR ALL TO authenticated
 USING(bucket_id='declaration-documents' AND (brick_private.is_admin() OR split_part(name,'/',1)=auth.uid()::text))
 WITH CHECK(bucket_id='declaration-documents' AND split_part(name,'/',1)=auth.uid()::text);
DROP POLICY IF EXISTS retain_declaration_evidence_update ON storage.objects;
CREATE POLICY retain_declaration_evidence_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'declaration-documents' OR NOT brick_private.declaration_evidence_referenced(name))
 WITH CHECK(bucket_id<>'declaration-documents' OR NOT brick_private.declaration_evidence_referenced(name));
DROP POLICY IF EXISTS retain_declaration_evidence_delete ON storage.objects;
CREATE POLICY retain_declaration_evidence_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'declaration-documents' OR NOT brick_private.declaration_evidence_referenced(name));
REVOKE ALL ON FUNCTION brick_private.guard_declaration_lock() FROM PUBLIC,anon,authenticated;
COMMIT;
