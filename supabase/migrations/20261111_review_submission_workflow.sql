-- Apply AFTER 20261111_resubmitted_property_reviews.sql. Explicit submission
-- supersedes its auto-resubmit-on-edit behavior for rejected listings.
BEGIN;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS review_resubmission_required boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS review_rejection_id uuid;
CREATE TABLE IF NOT EXISTS public.property_review_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid NOT NULL REFERENCES public.properties(id),
 seller_id uuid NOT NULL REFERENCES public.users(id),stage text NOT NULL CHECK(stage IN ('ownership','listing')),
 reason text NOT NULL,correction_scope text NOT NULL CHECK(correction_scope IN ('details','documents','both','details_or_documents')),
 required_action text NOT NULL,snapshot jsonb NOT NULL,imported_legacy boolean NOT NULL DEFAULT false,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),
 resubmitted_at timestamptz,submitted_to text CHECK(submitted_to IN ('ownership','listing'))
);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.properties'::regclass AND conname='properties_review_rejection_id_fkey') THEN
  ALTER TABLE public.properties ADD CONSTRAINT properties_review_rejection_id_fkey FOREIGN KEY(review_rejection_id) REFERENCES public.property_review_requests(id);
 END IF;
END $$;
ALTER TABLE public.property_review_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_review_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.property_review_requests TO authenticated;
DROP POLICY IF EXISTS read_property_review_requests ON public.property_review_requests;
CREATE POLICY read_property_review_requests ON public.property_review_requests FOR SELECT TO authenticated
 USING(brick_private.is_admin() OR seller_id::text=brick_private.actor()->>'id');
CREATE OR REPLACE FUNCTION brick_private.property_review_snapshot(pid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('details',to_jsonb(p)-ARRAY['status','verification_status','ownership_verified','ownership_review_status',
 'ownership_reviewed_at','identity_reviewed_at','listing_reviewed_at','listing_source','rejection_reason','review_rejection_id',
 'review_resubmission_required','updated_at','approved_at','views_count','availability_status','available_from','availability_confirmed_at',
 'is_featured','featured_until','featured_rank','featured_plan_key','featured_started_at','featured_last_order_id'],
 'evidence',coalesce((SELECT jsonb_agg(d.document_url ORDER BY d.id) FROM public.documents d WHERE d.property_id=p.id AND d.user_id=p.seller_id AND d.document_type::text='ownership'),'[]'::jsonb),
 'photos',coalesce((SELECT jsonb_agg(jsonb_build_array(i.id,i.image_url) ORDER BY i.id) FROM public.property_images i WHERE i.property_id=p.id),'[]'::jsonb),
 'videos',coalesce((SELECT jsonb_agg(jsonb_build_array(v.id,v.video_url) ORDER BY v.id) FROM public.property_videos v WHERE v.property_id=p.id),'[]'::jsonb))
 FROM public.properties p WHERE p.id=pid
$$;
CREATE OR REPLACE FUNCTION brick_private.guard_review_submission() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF TG_OP='INSERT' THEN
   IF NEW.review_resubmission_required OR NEW.review_rejection_id IS NOT NULL THEN RAISE EXCEPTION 'Review state is managed by checked workflows.' USING ERRCODE='42501'; END IF;
  ELSIF NEW.review_resubmission_required IS DISTINCT FROM OLD.review_resubmission_required OR NEW.review_rejection_id IS DISTINCT FROM OLD.review_rejection_id THEN
   RAISE EXCEPTION 'Use Resubmit for review; review state cannot be changed directly.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.status::text='rejected' AND OLD.status::text<>'rejected' THEN
   RAISE EXCEPTION 'Use the rejection form with a reason and required corrections.' USING ERRCODE='42501';
  END IF;
 END IF;
 -- Runs after the normal listing guard: details, files and media may be saved,
 -- but a rejected submission remains outside every pending queue until submitted.
 IF NEW.review_resubmission_required THEN
  NEW.status:='rejected';NEW.listing_reviewed_at:=NULL;
  IF TG_OP='UPDATE' AND OLD.review_resubmission_required THEN NEW.rejection_reason:=OLD.rejection_reason; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_review_submission ON public.properties;
CREATE TRIGGER zz_guard_review_submission BEFORE INSERT OR UPDATE ON public.properties
 FOR EACH ROW EXECUTE FUNCTION brick_private.guard_review_submission();
CREATE OR REPLACE FUNCTION public.reject_property_review(p_property_id uuid,p_stage text,p_reason text,p_scope text,p_required_action text,p_document_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.properties%ROWTYPE;d public.documents%ROWTYPE;request_id uuid;note text;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 IF p_stage IS NULL OR p_stage NOT IN ('ownership','listing') OR p_scope IS NULL OR p_scope NOT IN ('details','documents','both')
  OR nullif(trim(p_reason),'') IS NULL OR nullif(trim(p_required_action),'') IS NULL
  OR length(p_reason)>2000 OR length(p_required_action)>2000 THEN RAISE EXCEPTION 'Enter a rejection reason, correction category and required seller action (up to 2,000 characters each).'; END IF;
 IF p_stage='ownership' THEN
  SELECT * INTO d FROM public.documents WHERE id=p_document_id AND property_id=p_property_id AND document_type::text='ownership' FOR UPDATE;
  IF NOT FOUND OR d.status::text<>'pending' THEN RAISE EXCEPTION 'Pending ownership evidence not found.'; END IF;
 END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p.status::text<>'pending' OR p.review_resubmission_required THEN RAISE EXCEPTION 'This submission is no longer awaiting review. Refresh the queue.'; END IF;
 note:=trim(p_reason)||E'
Required correction: '||trim(p_required_action);
 IF p_stage='ownership' THEN
  IF d.user_id IS DISTINCT FROM p.seller_id OR p.ownership_review_status<>'unreviewed' THEN RAISE EXCEPTION 'Ownership evidence does not match the pending submission.'; END IF;
  INSERT INTO public.ownership_reviews(property_id,document_id,document_path,reviewer_auth_id,decision,owner_kind,owner_legal_name,project_name,checks,note)
   VALUES(p.id,d.id,d.document_url,auth.uid(),'rejected',p.owner_kind,p.owner_legal_name,p.owner_project_name,'{}',note);
  UPDATE public.documents SET status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=note WHERE id=d.id;
 ELSE
  IF ((p.ownership_verified AND p.ownership_review_status='approved') OR p.listing_source='brickinfinity_admin') IS NOT TRUE THEN
   RAISE EXCEPTION 'Ownership must be reviewed before the publication decision.';
  END IF;
 END IF;
 INSERT INTO public.property_review_requests(property_id,seller_id,stage,reason,correction_scope,required_action,snapshot,created_by)
  VALUES(p.id,p.seller_id,p_stage,trim(p_reason),p_scope,trim(p_required_action),brick_private.property_review_snapshot(p.id),auth.uid()) RETURNING id INTO request_id;
 IF p_stage='ownership' THEN
  UPDATE public.properties SET ownership_verified=false,ownership_review_status='rejected',ownership_reviewed_at=NULL,identity_reviewed_at=NULL,
   listing_reviewed_at=NULL,status='rejected',verification_status='ownership_rejected',rejection_reason=note,
   review_resubmission_required=true,review_rejection_id=request_id WHERE id=p.id;
 ELSE
  UPDATE public.properties SET status='rejected',verification_status='listing_rejected',listing_reviewed_at=NULL,rejection_reason=note,
   review_resubmission_required=true,review_rejection_id=request_id WHERE id=p.id;
 END IF;
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
  VALUES(p.seller_id,CASE WHEN p_stage='ownership' THEN 'Ownership submission rejected' ELSE 'Property listing rejected' END,
   note||E'
Save your corrections, then choose Resubmit for review.','property','property','/dashboard/edit/'||p.id,'Review required corrections','property',p.id);
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
  VALUES(auth.uid(),p.seller_id,'property_review_rejected',jsonb_build_object('property_id',p.id,'request_id',request_id,'stage',p_stage));
 RETURN request_id;
END $$;
CREATE OR REPLACE FUNCTION public.resubmit_property_review(p_property_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.properties%ROWTYPE;u public.users%ROWTYPE;r public.property_review_requests%ROWTYPE;has_new_document boolean;details_changed boolean;destination text;verification public.properties.verification_status%TYPE;
BEGIN
 SELECT * INTO u FROM public.users WHERE user_id=auth.uid();
 IF NOT FOUND OR NOT (brick_private.eligible_owner() OR brick_private.is_admin()) THEN RAISE EXCEPTION 'Active verified owner access is required.' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property_id AND seller_id=u.id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Your property was not found.' USING ERRCODE='42501'; END IF;
 IF NOT p.review_resubmission_required OR p.status::text<>'rejected' THEN RAISE EXCEPTION 'This property does not need resubmission. Refresh its status.'; END IF;
 SELECT * INTO r FROM public.property_review_requests WHERE id=p.review_rejection_id AND property_id=p.id AND seller_id=u.id FOR UPDATE;
 IF NOT FOUND OR r.resubmitted_at IS NOT NULL THEN RAISE EXCEPTION 'Current rejection instructions not found. Refresh the property.'; END IF;
 IF NOT brick_private.identity_evidence_ready(u.id) OR p.owner_kind IS NULL OR p.owner_kind NOT IN ('owner','project_owner_builder') OR p.owner_attested IS DISTINCT FROM true
  OR nullif(trim(p.owner_legal_name),'') IS NULL OR (u.role::text<>'admin' AND p.owner_kind IS DISTINCT FROM u.seller_identity)
  OR (p.owner_kind='project_owner_builder' AND nullif(trim(p.owner_project_name),'') IS NULL) THEN RAISE EXCEPTION 'Complete current identity, legal owner/project details and ownership confirmation.'; END IF;
 details_changed:=(brick_private.property_review_snapshot(p.id)-'evidence') IS DISTINCT FROM (r.snapshot-'evidence');
 SELECT EXISTS(SELECT 1 FROM public.documents d JOIN storage.objects o ON o.bucket_id='ownership-documents' AND o.name=d.document_url
  WHERE d.property_id=p.id AND d.user_id=u.id AND d.document_type::text='ownership' AND d.created_at>r.created_at AND o.created_at>r.created_at AND d.status::text='pending'
   AND NOT (coalesce(r.snapshot->'evidence','[]'::jsonb) ? d.document_url)) INTO has_new_document;
 IF r.correction_scope IN ('details','both') AND NOT details_changed THEN RAISE EXCEPTION 'Save the requested property corrections before resubmitting.'; END IF;
 IF r.correction_scope IN ('documents','both') AND NOT has_new_document THEN RAISE EXCEPTION 'Upload and save new ownership evidence before resubmitting.'; END IF;
 IF r.correction_scope='details_or_documents' AND NOT details_changed AND NOT has_new_document THEN RAISE EXCEPTION 'Save corrected details or new ownership evidence before resubmitting.'; END IF;
 IF (p.ownership_verified AND p.ownership_review_status='approved') OR p.listing_source='brickinfinity_admin' THEN destination:='listing';
 ELSE
  destination:='ownership';
  IF NOT EXISTS(SELECT 1 FROM public.documents d JOIN storage.objects o ON o.bucket_id='ownership-documents' AND o.name=d.document_url
   WHERE d.property_id=p.id AND d.user_id=u.id AND d.document_type::text='ownership' AND d.status::text IN ('pending','rejected','approved')) THEN
   RAISE EXCEPTION 'Upload and save ownership evidence for this property before resubmitting.';
  END IF;
 END IF;
 verification:=CASE WHEN destination='ownership' THEN 'ownership_submitted' ELSE 'ownership_approved' END;
 UPDATE public.properties SET review_resubmission_required=false,status='pending',rejection_reason=NULL,listing_reviewed_at=NULL,
  ownership_review_status=CASE WHEN destination='ownership' THEN 'unreviewed' ELSE ownership_review_status END,
  verification_status=verification WHERE id=p.id;
 IF destination='ownership' AND NOT EXISTS(SELECT 1 FROM public.documents WHERE property_id=p.id AND user_id=u.id AND document_type::text='ownership' AND status::text='pending') THEN
  UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
   WHERE property_id=p.id AND user_id=u.id AND document_type::text='ownership' AND status::text IN ('rejected','approved');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.properties saved WHERE saved.id=p.id AND saved.status::text='pending' AND NOT saved.review_resubmission_required
  AND (destination='listing' OR (saved.ownership_review_status='unreviewed' AND NOT saved.ownership_verified
   AND EXISTS(SELECT 1 FROM public.documents pending_doc WHERE pending_doc.property_id=p.id AND pending_doc.user_id=u.id
    AND pending_doc.document_type::text='ownership' AND pending_doc.status::text='pending')))) THEN
  RAISE EXCEPTION 'The review queue state could not be confirmed. No submission was saved; contact an admin to inspect conflicting database triggers.';
 END IF;
 UPDATE public.property_review_requests SET resubmitted_at=now(),submitted_to=destination WHERE id=r.id;
 INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
  VALUES(auth.uid(),u.id,'property_review_resubmitted',jsonb_build_object('property_id',p.id,'request_id',r.id,'queue',destination));
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
  VALUES(u.id,'Property resubmitted for review','Your corrections were submitted to the '||destination||' review queue. Approval is still required.',
   'property','property','/dashboard/edit/'||p.id,'View review status','property',p.id);
 RETURN destination;
END $$;
-- Protect the original approval RPC from incomplete old rejection callers.
CREATE OR REPLACE FUNCTION public.review_property_ownership(p_document_id uuid,p_approve boolean,p_checks jsonb,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.documents%ROWTYPE;p public.properties%ROWTYPE;u public.users%ROWTYPE;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 IF NOT p_approve THEN RAISE EXCEPTION 'Use the rejection form with a reason and required corrections.'; END IF;
 IF nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'A review note is required.'; END IF;
 SELECT * INTO d FROM public.documents WHERE id=p_document_id AND document_type::text='ownership' FOR UPDATE;
 IF NOT FOUND OR d.status::text<>'pending' THEN RAISE EXCEPTION 'Pending ownership evidence not found.'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=d.property_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.user_id IS DISTINCT FROM p.seller_id THEN RAISE EXCEPTION 'Evidence does not match the listing owner.'; END IF;
 IF p.review_resubmission_required OR p.status::text<>'pending' THEN RAISE EXCEPTION 'The seller must resubmit the corrected property before ownership approval.'; END IF;
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
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
  VALUES(p.seller_id,'Ownership documents approved','Ownership review is complete. The listing still needs the separate publication review.',
   'property','property','/dashboard/edit/'||p.id,'View property status','property',p.id);
END $$;

-- Carry existing rejected inventory into the draft correction workflow without
-- guessing whether its old free-text reason required details or new documents.
DO $$ DECLARE p record;r uuid; BEGIN
 FOR p IN SELECT * FROM public.properties WHERE status::text='rejected' AND deleted_at IS NULL AND NOT review_resubmission_required LOOP
  INSERT INTO public.property_review_requests(property_id,seller_id,stage,reason,correction_scope,required_action,snapshot,imported_legacy)
   VALUES(p.id,p.seller_id,CASE WHEN p.ownership_review_status='rejected' THEN 'ownership' ELSE 'listing' END,
    coalesce(nullif(p.rejection_reason,''),'Earlier submission rejected.'),'details_or_documents',
    'Address the rejection reason by correcting the property details or uploading corrected ownership evidence. Save, then resubmit for review.',brick_private.property_review_snapshot(p.id),true) RETURNING id INTO r;
  UPDATE public.properties SET review_rejection_id=r,review_resubmission_required=true WHERE id=p.id;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION brick_private.property_review_snapshot(uuid),brick_private.guard_review_submission() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reject_property_review(uuid,text,text,text,text,uuid),public.resubmit_property_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reject_property_review(uuid,text,text,text,text,uuid),public.resubmit_property_review(uuid) TO authenticated;
COMMIT;
