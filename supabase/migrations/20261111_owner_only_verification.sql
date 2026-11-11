BEGIN;
-- Owner-only enforcement. Apply all earlier migrations first.
-- Existing non-admin published listings are deliberately paused for ownership re-review.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE SCHEMA IF NOT EXISTS brick_private;
REVOKE ALL ON SCHEMA brick_private FROM PUBLIC;
GRANT USAGE ON SCHEMA brick_private TO authenticated;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS seller_identity text,
  ADD COLUMN IF NOT EXISTS owner_declaration_at timestamptz;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS owner_kind text,
  ADD COLUMN IF NOT EXISTS owner_legal_name text,
  ADD COLUMN IF NOT EXISTS owner_project_name text,
  ADD COLUMN IF NOT EXISTS owner_attested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS listing_source text,
  ADD COLUMN IF NOT EXISTS ownership_review_status text NOT NULL DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS ownership_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS listing_reviewed_at timestamptz;
CREATE TABLE IF NOT EXISTS public.ownership_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid NOT NULL REFERENCES public.properties(id),
  document_id uuid NOT NULL REFERENCES public.documents(id), document_path text NOT NULL,
  reviewer_auth_id uuid NOT NULL, decision text NOT NULL CHECK(decision IN ('approved','rejected')),
  owner_kind text, owner_legal_name text, project_name text, checks jsonb NOT NULL,
  note text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.account_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_auth_id uuid, user_id uuid NOT NULL,
 action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION brick_private.actor() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT to_jsonb(u) FROM public.users u WHERE u.user_id=auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION brick_private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(brick_private.actor()->>'role'='admin',false)
$$;
CREATE OR REPLACE FUNCTION brick_private.eligible_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(brick_private.actor()->>'role'='seller'
 AND brick_private.actor()->>'kyc_status'='approved' AND brick_private.actor()->>'seller_status'='active'
 AND brick_private.actor()->>'seller_identity' IN ('owner','project_owner_builder')
 AND brick_private.actor()->>'owner_declaration_at' IS NOT NULL,false)
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brick_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA brick_private TO authenticated;
ALTER TABLE public.ownership_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ownership_reviews,public.account_security_events FROM anon,authenticated;
GRANT SELECT ON public.ownership_reviews,public.account_security_events TO authenticated;
DROP POLICY IF EXISTS read_ownership_reviews ON public.ownership_reviews;
CREATE POLICY read_ownership_reviews ON public.ownership_reviews FOR SELECT TO authenticated USING (
 brick_private.is_admin() OR EXISTS(SELECT 1 FROM public.properties p WHERE p.id=property_id AND p.seller_id::text=brick_private.actor()->>'id'));
DROP POLICY IF EXISTS read_security_events ON public.account_security_events;
CREATE POLICY read_security_events ON public.account_security_events FOR SELECT TO authenticated USING(brick_private.is_admin());
-- Replace the known recursive user policies; unknown policies remain intact, with triggers providing field guards.
DROP POLICY IF EXISTS users_select_own_or_admin ON public.users;
CREATE POLICY users_select_own_or_admin ON public.users FOR SELECT TO authenticated USING(user_id=auth.uid() OR brick_private.is_admin());
DROP POLICY IF EXISTS users_update_own_or_admin ON public.users;
CREATE POLICY users_update_own_or_admin ON public.users FOR UPDATE TO authenticated USING(user_id=auth.uid() OR brick_private.is_admin()) WITH CHECK(user_id=auth.uid() OR brick_private.is_admin());
CREATE OR REPLACE FUNCTION brick_private.guard_user_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN RAISE EXCEPTION 'Account identity cannot be reassigned.' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role AND (OLD.role::text='admin' OR NEW.role::text='admin') THEN RAISE EXCEPTION 'Use the checked staff access workflow.' USING ERRCODE='42501'; END IF;
 IF NOT brick_private.is_admin() THEN
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only your own profile may be changed.' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN
   NEW.id:=gen_random_uuid();
   IF coalesce(NEW.role::text,'buyer')<>'buyer' OR coalesce(NEW.kyc_status::text,'not_submitted') NOT IN ('not_submitted','pending') OR NEW.seller_identity IS NOT NULL OR NEW.owner_declaration_at IS NOT NULL THEN
    RAISE EXCEPTION 'Approval and identity fields are managed by reviewed workflows.' USING ERRCODE='42501'; END IF;
  ELSE
   IF NEW.role IS DISTINCT FROM OLD.role OR (NEW.kyc_status IS DISTINCT FROM OLD.kyc_status AND NEW.kyc_status::text<>'pending')
    OR (NEW.seller_status IS DISTINCT FROM OLD.seller_status AND NEW.seller_status::text NOT IN ('pending_seller','basic'))
    OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity OR NEW.owner_declaration_at IS DISTINCT FROM OLD.owner_declaration_at THEN
    RAISE EXCEPTION 'Approval and identity fields are managed by reviewed workflows.' USING ERRCODE='42501'; END IF;
   IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Authentication identity cannot be changed.' USING ERRCODE='42501'; END IF;
   IF NEW.full_name IS DISTINCT FROM OLD.full_name AND OLD.kyc_status::text='approved' THEN
    NEW.kyc_status:='pending'; NEW.role:='buyer'; NEW.seller_status:='pending_seller';
   END IF;
  END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.kyc_status::text='approved' AND NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
   RAISE EXCEPTION 'Use identity document review to approve KYC.' USING ERRCODE='42501'; END IF;
  IF NEW.role::text='seller' AND (NEW.kyc_status::text<>'approved' OR NEW.owner_declaration_at IS NULL) THEN
   RAISE EXCEPTION 'Seller access requires approved identity and an owner-only declaration.'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_owner_account_fields ON public.users;
CREATE TRIGGER guard_owner_account_fields BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION brick_private.guard_user_fields();
CREATE OR REPLACE FUNCTION brick_private.account_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status OR NEW.seller_status IS DISTINCT FROM OLD.seller_status OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity THEN
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),NEW.id,'account_permissions_changed',jsonb_build_object('old_role',OLD.role,'new_role',NEW.role,'old_kyc',OLD.kyc_status,'new_kyc',NEW.kyc_status,'seller_identity',NEW.seller_identity));
  IF NEW.role::text='admin' AND OLD.role::text<>'admin' THEN UPDATE public.properties SET listing_source='brickinfinity_admin' WHERE seller_id=NEW.id; END IF;
  IF NEW.role::text<>'admin' AND (NEW.role::text<>'seller' OR NEW.kyc_status::text<>'approved' OR NEW.seller_status::text<>'active' OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity) THEN
   UPDATE public.properties SET status='pending', verification_status='ownership_submitted', ownership_verified=false,
    ownership_review_status='unreviewed',ownership_reviewed_at=NULL,identity_reviewed_at=NULL,listing_reviewed_at=NULL
   WHERE seller_id=NEW.id AND deleted_at IS NULL;
   UPDATE public.documents d SET status='pending',reviewed_at=NULL,reviewed_by=NULL FROM public.properties p WHERE d.property_id=p.id AND p.seller_id=NEW.id AND d.document_type::text='ownership' AND p.ownership_review_status='unreviewed';
   IF NEW.kyc_status::text='pending' AND OLD.kyc_status::text='approved' THEN UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL WHERE user_id=NEW.id AND property_id IS NULL AND status::text='approved'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS owner_account_changed ON public.users;
CREATE TRIGGER owner_account_changed AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION brick_private.account_changed();
CREATE OR REPLACE FUNCTION public.declare_owner_identity(p_identity text,p_accept boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR p_accept IS DISTINCT FROM true OR p_identity IS NULL OR p_identity NOT IN ('owner','project_owner_builder') THEN RAISE EXCEPTION 'Accept the owner-only, no-agent declaration.'; END IF;
 UPDATE public.users SET seller_identity=p_identity,owner_declaration_at=now(),
 role=CASE WHEN role::text='buyer' AND kyc_status::text='approved' AND brick_private.identity_evidence_ready(id) THEN 'seller' ELSE role END,
 seller_status=CASE WHEN role::text='buyer' AND kyc_status::text='approved' AND brick_private.identity_evidence_ready(id) THEN 'active' ELSE seller_status END WHERE user_id=auth.uid() AND role::text<>'admin';
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found or declaration not needed.'; END IF;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) SELECT auth.uid(),id,'owner_declaration_recorded',jsonb_build_object('identity',p_identity,'no_agent',true,'policy_version','owner-only-v1') FROM public.users WHERE user_id=auth.uid();
END $$;
CREATE OR REPLACE FUNCTION brick_private.guard_property() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a jsonb:=brick_private.actor(); material boolean:=false; identity_changed boolean:=false;
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.views_count IS DISTINCT FROM OLD.views_count THEN RAISE EXCEPTION 'View counts are recorded by the platform.' USING ERRCODE='42501'; END IF;
 IF NOT brick_private.is_admin() THEN
  IF TG_OP='INSERT' THEN
   IF coalesce(NEW.is_featured,false) OR NEW.featured_until IS NOT NULL OR NEW.featured_plan_key IS NOT NULL THEN RAISE EXCEPTION 'Promotion fields are managed by the platform.'; END IF;
  ELSIF NEW.is_featured IS DISTINCT FROM OLD.is_featured OR NEW.featured_until IS DISTINCT FROM OLD.featured_until OR NEW.featured_rank IS DISTINCT FROM OLD.featured_rank OR NEW.featured_plan_key IS DISTINCT FROM OLD.featured_plan_key THEN RAISE EXCEPTION 'Promotion fields are managed by the platform.'; END IF;
  IF NOT brick_private.eligible_owner() OR NEW.seller_id::text IS DISTINCT FROM a->>'id' THEN RAISE EXCEPTION 'Only approved actual owners and project-owning builders may list.' USING ERRCODE='42501'; END IF;
  IF NEW.owner_kind NOT IN ('owner','project_owner_builder') OR NEW.owner_kind IS DISTINCT FROM a->>'seller_identity' OR NEW.owner_attested IS DISTINCT FROM true OR nullif(trim(NEW.owner_legal_name),'') IS NULL OR (NEW.owner_kind='project_owner_builder' AND nullif(trim(NEW.owner_project_name),'') IS NULL) THEN
   RAISE EXCEPTION 'Provide the actual legal owner, owning-builder project details and no-agent declaration.'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.ownership_verified OR NEW.status::text NOT IN ('draft','pending') OR NEW.verification_status::text='approved' OR NEW.ownership_review_status<>'unreviewed' OR NEW.listing_source IS NOT NULL OR NEW.ownership_reviewed_at IS NOT NULL OR NEW.identity_reviewed_at IS NOT NULL OR NEW.listing_reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Only reviewed workflows may approve a listing.' USING ERRCODE='42501'; END IF;
  ELSE
   IF NEW.seller_id IS DISTINCT FROM OLD.seller_id OR (NEW.ownership_verified IS DISTINCT FROM OLD.ownership_verified AND NEW.ownership_verified)
    OR NEW.ownership_review_status IS DISTINCT FROM OLD.ownership_review_status OR NEW.listing_source IS DISTINCT FROM OLD.listing_source
    OR NEW.ownership_reviewed_at IS DISTINCT FROM OLD.ownership_reviewed_at OR NEW.identity_reviewed_at IS DISTINCT FROM OLD.identity_reviewed_at OR NEW.listing_reviewed_at IS DISTINCT FROM OLD.listing_reviewed_at
    OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text='active') OR (NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NEW.verification_status::text='approved') THEN
    RAISE EXCEPTION 'Only reviewed workflows may approve a listing.' USING ERRCODE='42501'; END IF;
   material := (to_jsonb(NEW) - ARRAY['status','verification_status','ownership_verified','rejection_reason','approved_at','updated_at','views_count','availability_status','available_from','availability_confirmed_at','is_featured','featured_until','featured_rank','featured_plan_key'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','verification_status','ownership_verified','rejection_reason','approved_at','updated_at','views_count','availability_status','available_from','availability_confirmed_at','is_featured','featured_until','featured_rank','featured_plan_key']);
   identity_changed := NEW.city_id IS DISTINCT FROM OLD.city_id OR NEW.locality_id IS DISTINCT FROM OLD.locality_id OR NEW.owner_kind IS DISTINCT FROM OLD.owner_kind OR NEW.owner_legal_name IS DISTINCT FROM OLD.owner_legal_name OR NEW.owner_project_name IS DISTINCT FROM OLD.owner_project_name OR NEW.owner_attested IS DISTINCT FROM OLD.owner_attested;
   IF identity_changed OR NEW.ownership_verified IS DISTINCT FROM OLD.ownership_verified THEN NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';NEW.ownership_reviewed_at:=NULL;NEW.identity_reviewed_at:=NULL;NEW.listing_source:=NULL; END IF;
   IF material OR identity_changed THEN
    NEW.status:='pending';NEW.listing_reviewed_at:=NULL;
    NEW.verification_status:=CASE WHEN NEW.ownership_verified THEN 'ownership_approved' ELSE 'ownership_submitted' END;
   END IF;
  END IF;
 ELSE
  IF TG_OP='INSERT' THEN NEW.listing_source:='brickinfinity_admin';NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';NEW.ownership_reviewed_at:=NULL;NEW.identity_reviewed_at:=NULL;IF NEW.status::text='active' THEN NEW.listing_reviewed_at:=now();END IF;
  ELSE
   IF (NEW.ownership_verified IS DISTINCT FROM OLD.ownership_verified AND NEW.ownership_verified) OR NEW.ownership_review_status IS DISTINCT FROM OLD.ownership_review_status OR NEW.listing_source IS DISTINCT FROM OLD.listing_source OR NEW.ownership_reviewed_at IS DISTINCT FROM OLD.ownership_reviewed_at OR NEW.identity_reviewed_at IS DISTINCT FROM OLD.identity_reviewed_at OR NEW.listing_reviewed_at IS DISTINCT FROM OLD.listing_reviewed_at OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text='active') THEN RAISE EXCEPTION 'Use checked ownership review and publication.'; END IF;
  END IF;
  IF TG_OP='UPDATE' THEN
   identity_changed := NEW.seller_id IS DISTINCT FROM OLD.seller_id OR NEW.city_id IS DISTINCT FROM OLD.city_id OR NEW.locality_id IS DISTINCT FROM OLD.locality_id OR NEW.owner_kind IS DISTINCT FROM OLD.owner_kind OR NEW.owner_legal_name IS DISTINCT FROM OLD.owner_legal_name OR NEW.owner_project_name IS DISTINCT FROM OLD.owner_project_name OR NEW.owner_attested IS DISTINCT FROM OLD.owner_attested;
   material := (to_jsonb(NEW)-ARRAY['status','verification_status','ownership_verified','rejection_reason','approved_at','updated_at','views_count','availability_status','available_from','availability_confirmed_at','is_featured','featured_until','featured_rank','featured_plan_key']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','verification_status','ownership_verified','rejection_reason','approved_at','updated_at','views_count','availability_status','available_from','availability_confirmed_at','is_featured','featured_until','featured_rank','featured_plan_key']);
   IF identity_changed THEN
    NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';NEW.ownership_reviewed_at:=NULL;NEW.identity_reviewed_at:=NULL;
    NEW.listing_source:=CASE WHEN EXISTS(SELECT 1 FROM public.users WHERE id=NEW.seller_id AND role::text='admin') THEN 'brickinfinity_admin' ELSE NULL END;
   END IF;
   IF material OR identity_changed THEN NEW.status:='pending';NEW.listing_reviewed_at:=NULL;NEW.verification_status:=CASE WHEN NEW.ownership_verified THEN 'ownership_approved' ELSE 'ownership_submitted' END; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_owner_only_property ON public.properties;
CREATE TRIGGER guard_owner_only_property BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.guard_property();
CREATE OR REPLACE FUNCTION brick_private.guard_document() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a jsonb:=brick_private.actor();
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 IF brick_private.is_admin() THEN
  IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.document_type IS DISTINCT FROM OLD.document_type) THEN RAISE EXCEPTION 'Document identity cannot be reassigned.'; END IF;
  IF NEW.status::text='pending' THEN NEW.reviewed_at:=NULL;NEW.reviewed_by:=NULL;RETURN NEW;END IF;
  RAISE EXCEPTION 'Use the checked document-review workflow.' USING ERRCODE='42501'; END IF;
 IF NEW.user_id::text IS DISTINCT FROM a->>'id' OR NEW.status::text<>'pending' THEN RAISE EXCEPTION 'Only pending documents for your own account may be submitted.' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.property_id IS DISTINCT FROM OLD.property_id OR NEW.document_type IS DISTINCT FROM OLD.document_type) THEN RAISE EXCEPTION 'Document identity cannot be reassigned.'; END IF;
 IF NEW.document_type::text='ownership' THEN
  IF NEW.property_id IS NULL OR split_part(NEW.document_url,'/',1) IS DISTINCT FROM NEW.property_id::text THEN RAISE EXCEPTION 'Ownership files must use this property folder.'; END IF;
 ELSE
  IF NEW.property_id IS NOT NULL OR NEW.document_type::text NOT IN ('aadhar','passport','driving_license','selfie') OR split_part(NEW.document_url,'/',1) IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Identity files must use your own account folder.'; END IF;
 END IF;
 IF NEW.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=NEW.property_id AND p.seller_id::text=a->>'id') THEN RAISE EXCEPTION 'Ownership evidence must belong to your own property.'; END IF;
 NEW.reviewed_at:=NULL;NEW.reviewed_by:=NULL;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_owner_documents ON public.documents;
CREATE TRIGGER guard_owner_documents BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION brick_private.guard_document();
CREATE OR REPLACE FUNCTION brick_private.identity_evidence_ready(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH latest AS (SELECT DISTINCT ON(d.document_type) d.document_type,d.status,d.document_url FROM public.documents d WHERE d.user_id=uid AND d.property_id IS NULL ORDER BY d.document_type,d.created_at DESC,d.id DESC)
 SELECT EXISTS(SELECT 1 FROM latest l JOIN storage.objects f ON f.name=l.document_url AND f.bucket_id='identity-documents' WHERE l.document_type::text='selfie' AND l.status::text='approved') AND EXISTS(SELECT 1 FROM latest l JOIN storage.objects f ON f.name=l.document_url AND f.bucket_id='identity-documents' WHERE l.document_type::text IN ('aadhar','passport','driving_license') AND l.status::text='approved')
$$;
CREATE OR REPLACE FUNCTION public.review_identity_document(p_document_id uuid,p_approve boolean,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents%ROWTYPE; u public.users%ROWTYPE; ready boolean;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'A review note is required.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=p_document_id AND property_id IS NULL FOR UPDATE;
 IF NOT FOUND OR d.document_type::text NOT IN ('aadhar','passport','driving_license','selfie') OR d.status::text<>'pending' THEN RAISE EXCEPTION 'Current pending identity document not found.'; END IF;
 IF p_approve AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='identity-documents' AND name=d.document_url) THEN RAISE EXCEPTION 'Identity evidence file not found.'; END IF;
 d.status:=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 UPDATE public.documents SET status=d.status,reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=CASE WHEN p_approve THEN NULL ELSE p_note END WHERE id=d.id;
 ready:=brick_private.identity_evidence_ready(d.user_id);
 IF NOT p_approve THEN UPDATE public.users SET kyc_status='rejected',role=CASE WHEN role::text='admin' THEN role ELSE 'buyer' END,seller_status='basic' WHERE id=d.user_id;
 ELSIF ready THEN
  SELECT * INTO u FROM public.users WHERE id=d.user_id FOR UPDATE;
  u.role:=CASE WHEN u.role::text='admin' THEN 'admin' WHEN u.owner_declaration_at IS NOT NULL THEN 'seller' ELSE 'buyer' END;
  u.seller_status:=CASE WHEN u.owner_declaration_at IS NOT NULL THEN 'active' ELSE 'basic' END;
  UPDATE public.users SET kyc_status='approved',role=u.role,seller_status=u.seller_status WHERE id=d.user_id;
 END IF;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),d.user_id,'identity_document_reviewed',jsonb_build_object('document_id',d.id,'document_path',d.document_url,'document_type',d.document_type,'approved',p_approve,'note',p_note));
END $$;
CREATE OR REPLACE FUNCTION public.review_property_ownership(p_document_id uuid,p_approve boolean,p_checks jsonb,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents%ROWTYPE;p public.properties%ROWTYPE;u public.users%ROWTYPE;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'A review note is required.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=p_document_id AND document_type::text='ownership' FOR UPDATE;
 IF NOT FOUND OR d.status::text<>'pending' THEN RAISE EXCEPTION 'Pending ownership evidence not found.'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=d.property_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.user_id IS DISTINCT FROM p.seller_id THEN RAISE EXCEPTION 'Evidence does not match the listing owner.'; END IF;
 SELECT * INTO u FROM public.users WHERE id=p.seller_id;
 IF p_approve THEN
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='ownership-documents' AND name=d.document_url) THEN RAISE EXCEPTION 'Ownership evidence file not found.'; END IF;
  IF u.kyc_status::text<>'approved' OR (u.role::text<>'admin' AND (u.role::text<>'seller' OR u.seller_status::text<>'active' OR u.owner_declaration_at IS NULL)) THEN RAISE EXCEPTION 'Approved owner identity is required.'; END IF;
  IF p.owner_kind IS NULL OR p.owner_kind NOT IN ('owner','project_owner_builder') OR nullif(trim(p.owner_legal_name),'') IS NULL OR NOT p.owner_attested THEN RAISE EXCEPTION 'Owner details and declaration are required.'; END IF;
  IF NOT brick_private.identity_evidence_ready(u.id) THEN RAISE EXCEPTION 'Approved identity documents and selfie files must be present.'; END IF;
  IF p_checks->>'identity_matches' IS DISTINCT FROM 'true' OR p_checks->>'property_matches' IS DISTINCT FROM 'true' OR p_checks->>'owns_property' IS DISTINCT FROM 'true' OR p_checks->>'no_agent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Complete all ownership checks.'; END IF;
  IF p.owner_kind='project_owner_builder' AND (nullif(trim(p.owner_project_name),'') IS NULL OR p_checks->>'company_owns_project' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'Evidence that the builder company owns this project is required.'; END IF;
 END IF;
 INSERT INTO public.ownership_reviews(property_id,document_id,document_path,reviewer_auth_id,decision,owner_kind,owner_legal_name,project_name,checks,note) VALUES(p.id,d.id,d.document_url,auth.uid(),CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,p.owner_kind,p.owner_legal_name,p.owner_project_name,coalesce(p_checks,'{}') || jsonb_build_object('identity_evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',i.id,'document_path',i.document_url,'document_type',i.document_type)) FROM public.documents i WHERE i.user_id=u.id AND i.property_id IS NULL AND i.status::text='approved'),'[]'::jsonb), 'supporting_property_evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',e.id,'document_path',e.document_url,'status',e.status)) FROM public.documents e WHERE e.property_id=p.id AND e.user_id=u.id AND e.document_type::text='ownership'),'[]'::jsonb)),p_note);
 d.status:=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 UPDATE public.documents SET status=d.status,reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=CASE WHEN p_approve THEN NULL ELSE p_note END WHERE id=d.id;
 p.status:=CASE WHEN p_approve THEN 'pending' ELSE 'rejected' END;
 p.verification_status:=CASE WHEN p_approve THEN 'ownership_approved' ELSE 'ownership_rejected' END;
 UPDATE public.properties SET ownership_verified=p_approve,ownership_review_status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
  ownership_reviewed_at=CASE WHEN p_approve THEN now() ELSE NULL END,identity_reviewed_at=CASE WHEN p_approve THEN now() ELSE NULL END,
  listing_source=CASE WHEN p_approve AND u.role::text='admin' THEN 'brickinfinity_admin' WHEN p_approve THEN p.owner_kind ELSE NULL END,listing_reviewed_at=NULL,
  status=p.status,verification_status=p.verification_status,rejection_reason=CASE WHEN p_approve THEN NULL ELSE p_note END
 WHERE id=p.id;
END $$;
CREATE OR REPLACE FUNCTION public.admin_publish_property(p_property_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.properties%ROWTYPE;u public.users%ROWTYPE;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property_id AND deleted_at IS NULL AND status::text='pending' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending listing not found.'; END IF;
 SELECT * INTO u FROM public.users WHERE id=p.seller_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Owner account not found.'; END IF;
 IF coalesce(p.brokerage_charge,0)<>0 THEN RAISE EXCEPTION 'Remove the legacy brokerage entry before publication.'; END IF;
 IF u.role::text<>'admin' AND (u.role::text<>'seller' OR u.kyc_status::text<>'approved' OR u.seller_status::text<>'active' OR u.owner_declaration_at IS NULL OR p.ownership_review_status<>'approved' OR NOT p.ownership_verified OR NOT EXISTS(SELECT 1 FROM public.ownership_reviews r WHERE r.property_id=p.id AND r.decision='approved' AND r.created_at=p.ownership_reviewed_at)) THEN RAISE EXCEPTION 'Current owner identity and reviewed ownership evidence are required.'; END IF;
 UPDATE public.properties SET status='active',verification_status='approved',listing_reviewed_at=now(),approved_at=now(),rejection_reason=NULL WHERE id=p.id;
 RETURN p.id;
END $$;
-- Media changes also reopen listing review; cover reordering does not.
CREATE OR REPLACE FUNCTION brick_private.media_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pid uuid; p public.properties%ROWTYPE; a jsonb:=brick_private.actor();
BEGIN
 pid:=CASE WHEN TG_OP='DELETE' THEN OLD.property_id ELSE NEW.property_id END;
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 IF NOT brick_private.is_admin() THEN
  IF NOT brick_private.eligible_owner() OR NOT EXISTS(SELECT 1 FROM public.properties prop WHERE prop.id=pid AND prop.seller_id::text=a->>'id') THEN RAISE EXCEPTION 'Only the approved owner can change listing media.' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND NEW.property_id IS DISTINCT FROM OLD.property_id THEN RAISE EXCEPTION 'Media cannot be reassigned.'; END IF;
  IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-ARRAY['sort_order']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['sort_order']) THEN
   SELECT * INTO p FROM public.properties WHERE id=pid AND status::text='active' FOR UPDATE;
   IF FOUND THEN p.verification_status:=CASE WHEN p.ownership_verified THEN 'ownership_approved' ELSE 'ownership_submitted' END;
    UPDATE public.properties SET status='pending',verification_status=p.verification_status,listing_reviewed_at=NULL WHERE id=p.id; END IF;
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS owner_image_changes ON public.property_images;
CREATE TRIGGER owner_image_changes AFTER INSERT OR UPDATE OR DELETE ON public.property_images FOR EACH ROW EXECUTE FUNCTION brick_private.media_changed();
DROP TRIGGER IF EXISTS owner_video_changes ON public.property_videos;
CREATE TRIGGER owner_video_changes AFTER INSERT OR UPDATE OR DELETE ON public.property_videos FOR EACH ROW EXECUTE FUNCTION brick_private.media_changed();
-- Retain the historical brokerage column for accounting, but prohibit new commissions.
CREATE OR REPLACE FUNCTION brick_private.no_brokerage() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN IF coalesce(NEW.brokerage_charge,0)<>0 THEN RAISE EXCEPTION 'Brokerage is not permitted on this owner-only platform.'; END IF;
 ELSIF NEW.brokerage_charge IS DISTINCT FROM OLD.brokerage_charge AND coalesce(NEW.brokerage_charge,0)<>0 THEN RAISE EXCEPTION 'Brokerage is not permitted on this owner-only platform.'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS owner_only_no_brokerage ON public.properties;
CREATE TRIGGER owner_only_no_brokerage BEFORE INSERT OR UPDATE OF brokerage_charge ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.no_brokerage();
-- Conservative transition: no invented verification for existing listings.
UPDATE public.properties SET status='pending',listing_reviewed_at=NULL WHERE coalesce(brokerage_charge,0)<>0 AND status::text='active';
UPDATE public.properties p SET listing_source='brickinfinity_admin',ownership_verified=CASE WHEN p.ownership_review_status='approved' THEN p.ownership_verified ELSE false END FROM public.users u WHERE p.seller_id=u.id AND u.role::text='admin';
UPDATE public.properties p SET status='pending',verification_status='ownership_submitted',ownership_verified=false,ownership_review_status='unreviewed',ownership_reviewed_at=NULL,identity_reviewed_at=NULL,listing_reviewed_at=NULL
FROM public.users u WHERE p.seller_id=u.id AND u.role::text<>'admin' AND p.status::text='active' AND p.ownership_review_status<>'approved' AND p.deleted_at IS NULL;
UPDATE public.documents d SET status='pending',reviewed_at=NULL,reviewed_by=NULL FROM public.properties p WHERE d.property_id=p.id AND d.document_type::text='ownership' AND p.ownership_review_status='unreviewed' AND p.status::text='pending';
REVOKE ALL ON FUNCTION public.declare_owner_identity(text,boolean),public.review_identity_document(uuid,boolean,text),public.review_property_ownership(uuid,boolean,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.declare_owner_identity(text,boolean),public.review_identity_document(uuid,boolean,text),public.review_property_ownership(uuid,boolean,jsonb,text) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brick_private FROM PUBLIC;
CREATE OR REPLACE FUNCTION brick_private.evidence_resubmitted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status::text='pending' THEN
  IF TG_OP='UPDATE' AND NEW.document_url IS NOT DISTINCT FROM OLD.document_url AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  IF NEW.property_id IS NULL THEN
   UPDATE public.users SET kyc_status='pending',role=CASE WHEN role::text='admin' THEN role ELSE 'buyer' END,seller_status='pending_seller' WHERE id=NEW.user_id;
  ELSE
   UPDATE public.properties SET status='pending',verification_status='ownership_submitted',ownership_verified=false,ownership_review_status='unreviewed',ownership_reviewed_at=NULL,identity_reviewed_at=NULL,listing_reviewed_at=NULL WHERE id=NEW.property_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS evidence_resubmitted ON public.documents;
CREATE TRIGGER evidence_resubmitted AFTER INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION brick_private.evidence_resubmitted();
-- Private files: restrict access even if an older permissive Storage policy is present.
UPDATE storage.buckets SET public=false WHERE id IN ('identity-documents','ownership-documents');
CREATE OR REPLACE FUNCTION brick_private.document_access(bucket text,path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT brick_private.is_admin() OR (bucket='identity-documents' AND split_part(path,'/',1)=auth.uid()::text)
 OR (bucket='ownership-documents' AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id::text=split_part(path,'/',1) AND p.seller_id::text=brick_private.actor()->>'id'))
$$;
CREATE OR REPLACE FUNCTION brick_private.protected_evidence(path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.document_url=path AND d.status::text='approved')
 OR EXISTS(SELECT 1 FROM public.ownership_reviews r WHERE r.document_path=path)
 OR EXISTS(SELECT 1 FROM public.document_versions v WHERE v.document_url=path)
 OR EXISTS(SELECT 1 FROM public.account_security_events e WHERE e.action='identity_document_reviewed' AND e.details->>'document_path'=path)
 OR EXISTS(SELECT 1 FROM public.ownership_reviews r WHERE r.checks->'identity_evidence' @> jsonb_build_array(jsonb_build_object('document_path',path)) OR r.checks->'supporting_property_evidence' @> jsonb_build_array(jsonb_build_object('document_path',path)))
$$;
GRANT EXECUTE ON FUNCTION brick_private.document_access(text,text),brick_private.protected_evidence(text) TO authenticated;
DROP POLICY IF EXISTS owner_private_documents_anon ON storage.objects;
CREATE POLICY owner_private_documents_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id NOT IN ('identity-documents','ownership-documents')) WITH CHECK(bucket_id NOT IN ('identity-documents','ownership-documents'));
DROP POLICY IF EXISTS owner_private_documents_scope ON storage.objects;
CREATE POLICY owner_private_documents_scope ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id NOT IN ('identity-documents','ownership-documents') OR brick_private.document_access(bucket_id,name)) WITH CHECK(bucket_id NOT IN ('identity-documents','ownership-documents') OR brick_private.document_access(bucket_id,name));
DROP POLICY IF EXISTS owner_private_documents_allow ON storage.objects;
CREATE POLICY owner_private_documents_allow ON storage.objects FOR ALL TO authenticated USING(bucket_id IN ('identity-documents','ownership-documents') AND brick_private.document_access(bucket_id,name)) WITH CHECK(bucket_id IN ('identity-documents','ownership-documents') AND brick_private.document_access(bucket_id,name));
DROP POLICY IF EXISTS owner_private_documents_no_replace ON storage.objects;
CREATE POLICY owner_private_documents_no_replace ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id NOT IN ('identity-documents','ownership-documents') OR brick_private.is_admin() OR NOT brick_private.protected_evidence(name)) WITH CHECK(bucket_id NOT IN ('identity-documents','ownership-documents') OR brick_private.is_admin() OR NOT brick_private.protected_evidence(name));
DROP POLICY IF EXISTS owner_private_documents_no_delete ON storage.objects;
CREATE POLICY owner_private_documents_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id NOT IN ('identity-documents','ownership-documents') OR brick_private.is_admin() OR NOT brick_private.protected_evidence(name));
CREATE OR REPLACE FUNCTION brick_private.public_listing(pid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.properties p JOIN public.users u ON u.id=p.seller_id WHERE p.id=pid AND p.deleted_at IS NULL AND p.status::text='active' AND p.verification_status::text='approved'
 AND ((u.role::text='admin' AND p.listing_source='brickinfinity_admin') OR (u.role::text='seller' AND u.kyc_status::text='approved' AND u.seller_status::text='active' AND u.owner_declaration_at IS NOT NULL AND p.ownership_verified AND p.ownership_review_status='approved' AND EXISTS(SELECT 1 FROM public.ownership_reviews r WHERE r.property_id=p.id AND r.decision='approved' AND r.created_at=p.ownership_reviewed_at))))
$$;
GRANT USAGE ON SCHEMA brick_private TO anon;
GRANT EXECUTE ON FUNCTION brick_private.public_listing(uuid) TO anon,authenticated;
DROP POLICY IF EXISTS owner_public_read_anon ON public.properties;
CREATE POLICY owner_public_read_anon ON public.properties AS RESTRICTIVE FOR SELECT TO anon USING(brick_private.public_listing(id));
DROP POLICY IF EXISTS owner_public_read_authenticated ON public.properties;
CREATE POLICY owner_public_read_authenticated ON public.properties AS RESTRICTIVE FOR SELECT TO authenticated USING(brick_private.public_listing(id) OR brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id');
DROP POLICY IF EXISTS owner_manage_properties ON public.properties;
CREATE POLICY owner_manage_properties ON public.properties FOR ALL TO authenticated USING(brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id') WITH CHECK(brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id');
DROP POLICY IF EXISTS owner_public_read ON public.properties;
CREATE POLICY owner_public_read ON public.properties FOR SELECT TO anon,authenticated USING(brick_private.public_listing(id));
DROP POLICY IF EXISTS owner_evidence_scope ON public.documents;
CREATE POLICY owner_evidence_scope ON public.documents AS RESTRICTIVE FOR ALL TO authenticated USING(brick_private.is_admin() OR user_id::text=brick_private.actor()->>'id') WITH CHECK(brick_private.is_admin() OR user_id::text=brick_private.actor()->>'id');
DROP POLICY IF EXISTS owner_evidence_allow ON public.documents;
CREATE POLICY owner_evidence_allow ON public.documents FOR ALL TO authenticated USING(brick_private.is_admin() OR user_id::text=brick_private.actor()->>'id') WITH CHECK(brick_private.is_admin() OR user_id::text=brick_private.actor()->>'id');
DROP POLICY IF EXISTS owner_evidence_no_anon ON public.documents;
CREATE POLICY owner_evidence_no_anon ON public.documents AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
CREATE OR REPLACE FUNCTION brick_private.retain_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN RAISE EXCEPTION 'Evidence history is retained. Submit a new version instead.' USING ERRCODE='42501'; END IF;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS retain_owner_evidence ON public.documents;
CREATE TRIGGER retain_owner_evidence BEFORE DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION brick_private.retain_evidence();
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE,DELETE ON public.document_versions FROM anon,authenticated;
DROP POLICY IF EXISTS owner_version_scope ON public.document_versions;
CREATE POLICY owner_version_scope ON public.document_versions AS RESTRICTIVE FOR ALL TO authenticated USING(brick_private.is_admin() OR EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.user_id::text=brick_private.actor()->>'id')) WITH CHECK(brick_private.is_admin() OR (uploaded_by::text=brick_private.actor()->>'id' AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.user_id::text=brick_private.actor()->>'id' AND d.document_url=public.document_versions.document_url)));
DROP POLICY IF EXISTS owner_version_no_anon ON public.document_versions;
CREATE POLICY owner_version_no_anon ON public.document_versions AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brick_private FROM PUBLIC;
DROP POLICY IF EXISTS owner_accounts_scope ON public.users;
CREATE POLICY owner_accounts_scope ON public.users AS RESTRICTIVE FOR ALL TO authenticated USING(user_id=auth.uid() OR brick_private.is_admin()) WITH CHECK(user_id=auth.uid() OR brick_private.is_admin());
DROP POLICY IF EXISTS owner_accounts_no_anon ON public.users;
CREATE POLICY owner_accounts_no_anon ON public.users AS RESTRICTIVE FOR ALL TO anon USING(false) WITH CHECK(false);
DROP POLICY IF EXISTS owner_version_allow ON public.document_versions;
CREATE POLICY owner_version_allow ON public.document_versions FOR SELECT TO authenticated USING(brick_private.is_admin() OR EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.user_id::text=brick_private.actor()->>'id'));
DROP POLICY IF EXISTS owner_version_insert ON public.document_versions;
CREATE POLICY owner_version_insert ON public.document_versions FOR INSERT TO authenticated WITH CHECK(brick_private.is_admin() OR (uploaded_by::text=brick_private.actor()->>'id' AND EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.user_id::text=brick_private.actor()->>'id' AND d.document_url=public.document_versions.document_url)));
CREATE OR REPLACE FUNCTION public.confirm_property_availability(p_property_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE confirmed timestamptz;
BEGIN
 IF NOT brick_private.is_admin() AND NOT brick_private.eligible_owner() THEN RAISE EXCEPTION 'Approved owner access required.' USING ERRCODE='42501'; END IF;
 UPDATE public.properties p SET availability_status=CASE WHEN p.availability_status='unknown' THEN 'available' ELSE p.availability_status END,availability_confirmed_at=now()
 WHERE p.id=p_property_id AND p.deleted_at IS NULL AND p.availability_status IN ('unknown','available','available_from') AND (brick_private.is_admin() OR p.seller_id::text=brick_private.actor()->>'id') RETURNING availability_confirmed_at INTO confirmed;
 IF confirmed IS NULL THEN RAISE EXCEPTION 'Current listing not found.'; END IF;
 RETURN confirmed;
END $$;
REVOKE ALL ON FUNCTION public.confirm_property_availability(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_property_availability(uuid) TO authenticated;
CREATE TABLE IF NOT EXISTS public.listing_review_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid NOT NULL,actor_auth_id uuid,old_status text,new_status text,old_ownership_verified boolean,new_ownership_verified boolean,details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.listing_review_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.listing_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listing_review_events FROM anon,authenticated;
GRANT SELECT ON public.listing_review_events TO authenticated;
DROP POLICY IF EXISTS read_listing_review_events ON public.listing_review_events;
CREATE POLICY read_listing_review_events ON public.listing_review_events FOR SELECT TO authenticated USING(brick_private.is_admin());
CREATE OR REPLACE FUNCTION brick_private.audit_listing_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN INSERT INTO public.listing_review_events(property_id,actor_auth_id,new_status,new_ownership_verified) VALUES(NEW.id,auth.uid(),NEW.status,NEW.ownership_verified);
 ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.ownership_verified IS DISTINCT FROM OLD.ownership_verified OR NEW.ownership_review_status IS DISTINCT FROM OLD.ownership_review_status OR NEW.brokerage_charge IS DISTINCT FROM OLD.brokerage_charge THEN
 INSERT INTO public.listing_review_events(property_id,actor_auth_id,old_status,new_status,old_ownership_verified,new_ownership_verified,details) VALUES(NEW.id,auth.uid(),OLD.status,NEW.status,OLD.ownership_verified,NEW.ownership_verified,jsonb_build_object('old_brokerage',OLD.brokerage_charge,'new_brokerage',NEW.brokerage_charge));
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS audit_owner_listing ON public.properties;
CREATE TRIGGER audit_owner_listing AFTER INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.audit_listing_review();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brick_private FROM PUBLIC;
DROP TRIGGER IF EXISTS retain_owner_document_versions ON public.document_versions;
CREATE TRIGGER retain_owner_document_versions BEFORE UPDATE OR DELETE ON public.document_versions FOR EACH ROW EXECUTE FUNCTION brick_private.retain_evidence();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='seller_identity_owner_only') THEN ALTER TABLE public.users ADD CONSTRAINT seller_identity_owner_only CHECK(seller_identity IS NULL OR seller_identity IN ('owner','project_owner_builder')); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.properties'::regclass AND conname='owner_kind_owner_only') THEN ALTER TABLE public.properties ADD CONSTRAINT owner_kind_owner_only CHECK(owner_kind IS NULL OR owner_kind IN ('owner','project_owner_builder')); END IF;
END $$;
CREATE INDEX IF NOT EXISTS ownership_reviews_property_created_idx ON public.ownership_reviews(property_id,created_at DESC);
DROP POLICY IF EXISTS owner_property_update_scope ON public.properties;
CREATE POLICY owner_property_update_scope ON public.properties AS RESTRICTIVE FOR UPDATE TO authenticated USING(brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id') WITH CHECK(brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id');
DROP POLICY IF EXISTS owner_property_insert_scope ON public.properties;
CREATE POLICY owner_property_insert_scope ON public.properties AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(brick_private.is_admin() OR (brick_private.eligible_owner() AND seller_id::text=brick_private.actor()->>'id'));
DROP POLICY IF EXISTS owner_property_delete_scope ON public.properties;
CREATE POLICY owner_property_delete_scope ON public.properties AS RESTRICTIVE FOR DELETE TO authenticated USING(brick_private.is_admin() OR (brick_private.eligible_owner() AND seller_id::text=brick_private.actor()->>'id'));
REVOKE DELETE ON public.users FROM anon,authenticated;
CREATE OR REPLACE FUNCTION brick_private.reopen_owner_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.ownership_review_status='unreviewed' AND OLD.ownership_review_status='approved' THEN
  UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL WHERE property_id=NEW.id AND document_type::text='ownership' AND status::text='approved';
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS reopen_owner_evidence ON public.properties;
CREATE TRIGGER reopen_owner_evidence AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.reopen_owner_evidence();
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA brick_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.manage_staff_admin(p_user_id uuid,p_grant boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_row public.users%ROWTYPE;target public.users%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR p_grant IS NULL THEN RAISE EXCEPTION 'Staff admin access required.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(907251);
 SELECT * INTO actor_row FROM public.users WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR actor_row.role::text<>'admin' THEN RAISE EXCEPTION 'Staff admin access required.' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.'; END IF;
 IF p_grant THEN
  IF target.kyc_status::text<>'approved' OR NOT brick_private.identity_evidence_ready(target.id) THEN RAISE EXCEPTION 'Reviewed identity evidence is required for staff access.'; END IF;
  target.role:='admin';target.seller_status:='active';
 ELSE
  IF target.user_id=auth.uid() OR (SELECT count(*) FROM public.users WHERE role::text='admin')<=1 THEN RAISE EXCEPTION 'Self-removal or removal of the last admin is not permitted.'; END IF;
  IF target.role::text<>'admin' THEN RAISE EXCEPTION 'Target account is not a staff admin.'; END IF;
  target.role:='buyer';target.seller_status:='basic';
 END IF;
 UPDATE public.users SET role=target.role,seller_status=target.seller_status WHERE id=target.id;
END $$;
REVOKE ALL ON FUNCTION public.manage_staff_admin(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_staff_admin(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_publish_property(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_property(uuid) TO authenticated;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.users'::regclass AND conname='owner_only_account_roles') THEN ALTER TABLE public.users ADD CONSTRAINT owner_only_account_roles CHECK(role::text IN ('buyer','seller','admin')) NOT VALID; END IF;
END $$;
COMMIT;
