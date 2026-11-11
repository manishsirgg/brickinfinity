-- Apply after owner-only verification, trigger compatibility and legacy trigger retirement.
-- Substantive edits resubmit rejected ownership for human review. No auto-approval/publication.
BEGIN;
CREATE OR REPLACE FUNCTION brick_private.guard_property() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
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
    -- A substantive edit is a resubmission of a rejected property, even when
    -- the same retained ownership file is being offered for fresh review.
    IF OLD.ownership_review_status='rejected' THEN
     NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';
     NEW.ownership_reviewed_at:=NULL;NEW.identity_reviewed_at:=NULL;NEW.listing_source:=NULL;
    END IF;
    NEW.rejection_reason:=NULL;
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
   IF material OR identity_changed THEN
    -- A substantive edit is a resubmission of a rejected property, even when
    -- the same retained ownership file is being offered for fresh review.
    IF OLD.ownership_review_status='rejected' THEN
     NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';
     NEW.ownership_reviewed_at:=NULL;NEW.identity_reviewed_at:=NULL;NEW.listing_source:=NULL;
    END IF;
    NEW.rejection_reason:=NULL; NEW.status:='pending';NEW.listing_reviewed_at:=NULL;NEW.verification_status:=CASE WHEN NEW.ownership_verified THEN 'ownership_approved' ELSE 'ownership_submitted' END; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION brick_private.reopen_owner_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.ownership_review_status='unreviewed' AND OLD.ownership_review_status IN ('approved','rejected') THEN
  UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
   WHERE property_id=NEW.id AND user_id=NEW.seller_id AND document_type::text='ownership'
    AND status::text=OLD.ownership_review_status;
 END IF;
 RETURN NULL;
END $$;

-- Recover edits already stuck between rejection and pending review. Unchanged
-- rejected properties and properties without retained matching evidence are untouched.
UPDATE public.properties p SET ownership_review_status='unreviewed',ownership_verified=false,
 ownership_reviewed_at=NULL,identity_reviewed_at=NULL,listing_reviewed_at=NULL,
 listing_source=NULL,verification_status='ownership_submitted',rejection_reason=NULL
WHERE p.status::text='pending' AND p.ownership_review_status='rejected' AND p.deleted_at IS NULL
 AND EXISTS(SELECT 1 FROM public.documents d WHERE d.property_id=p.id AND d.user_id=p.seller_id
  AND d.document_type::text='ownership' AND d.status::text='rejected');
-- Older ownership/location edits could already mark the property unreviewed
-- without reopening rejected files. Requeue retained evidence only when there
-- is no actual pending ownership submission for this seller/property.
UPDATE public.documents d SET status='pending',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
FROM public.properties p
WHERE d.property_id=p.id AND d.user_id=p.seller_id AND d.document_type::text='ownership'
 AND d.status::text IN ('approved','rejected') AND p.status::text='pending'
 AND p.ownership_review_status='unreviewed' AND p.ownership_verified=false AND p.deleted_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.documents current_submission
  WHERE current_submission.property_id=p.id AND current_submission.user_id=p.seller_id
   AND current_submission.document_type::text='ownership' AND current_submission.status::text='pending');
COMMIT;
