-- One admin decision covers the user's current ID/selfie/declaration bundle.
-- Existing approvals, property reviews and public inventory are left unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION brick_private.identity_evidence_ready(uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH latest AS (SELECT DISTINCT ON(d.document_type) d.document_type,d.status,d.document_url FROM public.documents d WHERE d.user_id=uid AND d.property_id IS NULL ORDER BY d.document_type,d.created_at DESC NULLS LAST,d.id DESC)
 SELECT EXISTS(SELECT 1 FROM latest l JOIN storage.objects f ON f.name=l.document_url AND f.bucket_id='identity-documents' WHERE l.document_type::text='selfie' AND l.status::text='approved') AND EXISTS(SELECT 1 FROM latest l JOIN storage.objects f ON f.name=l.document_url AND f.bucket_id='identity-documents' WHERE l.document_type::text IN ('aadhar','passport','driving_license') AND l.status::text='approved')
$$;
CREATE OR REPLACE FUNCTION brick_private.identity_application_snapshot(uid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH latest AS (SELECT DISTINCT ON(document_type) * FROM public.documents WHERE user_id=uid AND property_id IS NULL
  AND document_type::text IN ('aadhar','passport','driving_license','selfie') ORDER BY document_type,created_at DESC NULLS LAST,id DESC)
 SELECT jsonb_build_object('full_name',u.full_name,'kyc_status',u.kyc_status,'seller_status',u.seller_status,'seller_identity',u.seller_identity,'owner_declaration_at',u.owner_declaration_at,
  'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'document_url',d.document_url,'status',d.status) ORDER BY d.id) FROM latest d),'[]'::jsonb))
 FROM public.users u WHERE u.id=uid
$$;
CREATE OR REPLACE FUNCTION brick_private.pending_identity_applicants() RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH latest AS (SELECT DISTINCT ON(d.user_id,d.document_type) d.user_id,d.status FROM public.documents d
  WHERE d.property_id IS NULL AND d.document_type::text IN ('aadhar','passport','driving_license','selfie')
  ORDER BY d.user_id,d.document_type,d.created_at DESC NULLS LAST,d.id DESC)
 SELECT DISTINCT l.user_id FROM latest l JOIN public.users u ON u.id=l.user_id WHERE l.status::text='pending' AND u.role::text<>'admin'
$$;
CREATE OR REPLACE FUNCTION public.count_pending_identity_applications() RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT count(*)::integer FROM brick_private.pending_identity_applicants());
END $$;
CREATE OR REPLACE FUNCTION public.get_pending_identity_applications(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE applications jsonb;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'profile',jsonb_build_object('id',u.id,'full_name',u.full_name,
  'email',to_jsonb(u)->>'email','phone',to_jsonb(u)->>'phone','owner_declaration_at',u.owner_declaration_at,'seller_identity',u.seller_identity,
  'kyc_status',u.kyc_status,'seller_status',u.seller_status),'documents',
  (SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.document_type),'[]'::jsonb) FROM
   (SELECT DISTINCT ON(document_type) * FROM public.documents WHERE user_id=u.id AND property_id IS NULL
     AND document_type::text IN ('aadhar','passport','driving_license','selfie') ORDER BY document_type,created_at DESC NULLS LAST,id DESC) d)) ORDER BY u.id),'[]'::jsonb)
 INTO applications FROM (SELECT profile.* FROM public.users profile JOIN brick_private.pending_identity_applicants() a ON a.user_id=profile.id
  ORDER BY profile.id LIMIT greatest(1,least(coalesce(p_limit,50),100))) u;
 RETURN applications;
END $$;
CREATE OR REPLACE FUNCTION public.review_identity_application(p_user_id uuid,p_approve boolean,p_note text,p_expected_application jsonb,p_required_action text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.users%ROWTYPE;expected jsonb;current_application jsonb;entry jsonb;doc_ids uuid[];application_id uuid:=gen_random_uuid();note text;
BEGIN
 IF NOT brick_private.is_admin() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE='42501'; END IF;
 IF p_approve IS NULL OR nullif(trim(p_note),'') IS NULL OR length(p_note)>2000 THEN RAISE EXCEPTION 'Enter an application review note or rejection reason (up to 2,000 characters).'; END IF;
 IF NOT p_approve AND (nullif(trim(p_required_action),'') IS NULL OR length(p_required_action)>2000) THEN RAISE EXCEPTION 'Explain what the applicant must correct before resubmitting (up to 2,000 characters).'; END IF;
 SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR u.role::text='admin' THEN RAISE EXCEPTION 'A non-admin seller application is required.'; END IF;
 PERFORM id FROM public.documents WHERE user_id=u.id AND property_id IS NULL
  AND document_type::text IN ('aadhar','passport','driving_license','selfie') ORDER BY id FOR UPDATE NOWAIT;
 current_application:=brick_private.identity_application_snapshot(u.id);
 expected:=p_expected_application;
 IF expected IS NULL OR jsonb_typeof(expected->'documents') IS DISTINCT FROM 'array'
  OR expected->'documents' IS DISTINCT FROM current_application->'documents'
  OR expected->>'full_name' IS DISTINCT FROM u.full_name
  OR expected->>'kyc_status' IS DISTINCT FROM u.kyc_status::text
  OR expected->>'seller_status' IS DISTINCT FROM u.seller_status::text
  OR expected->>'seller_identity' IS DISTINCT FROM u.seller_identity
  OR (expected->>'owner_declaration_at')::timestamptz IS DISTINCT FROM u.owner_declaration_at THEN
  RAISE EXCEPTION 'The application evidence, profile or declaration changed. Reload this application and review the current bundle before deciding.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(current_application->'documents') d WHERE d->>'status'='pending') THEN
  RAISE EXCEPTION 'This application is no longer pending. Refresh the KYC queue.';
 END IF;
 IF p_approve THEN
  IF u.owner_declaration_at IS NULL OR u.seller_identity IS NULL OR u.seller_identity NOT IN ('owner','project_owner_builder') THEN RAISE EXCEPTION 'The owner/project-owning-builder declaration must be saved before application approval.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.documents d JOIN jsonb_array_elements(current_application->'documents') x ON d.id=(x->>'id')::uuid WHERE d.document_type::text='selfie')
   OR NOT EXISTS(SELECT 1 FROM public.documents d JOIN jsonb_array_elements(current_application->'documents') x ON d.id=(x->>'id')::uuid WHERE d.document_type::text IN ('aadhar','passport','driving_license')) THEN
   RAISE EXCEPTION 'The application needs a government ID and matching selfie before approval.';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_application->'documents') d WHERE NOT EXISTS(
   SELECT 1 FROM storage.objects f WHERE f.bucket_id='identity-documents' AND f.name=d->>'document_url')) THEN
   RAISE EXCEPTION 'A current identity evidence file is missing. The applicant must upload it again.';
  END IF;
 END IF;
 SELECT array_agg((d->>'id')::uuid) INTO doc_ids FROM jsonb_array_elements(current_application->'documents') d;
 note:=trim(p_note)||CASE WHEN p_approve THEN '' ELSE E'\nRequired correction: '||trim(p_required_action) END;
 -- One SQL transaction and one user-level decision; no partially approved
 -- application is exposed between document updates and seller activation.
 IF p_approve THEN
  UPDATE public.documents SET status='approved',reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=NULL WHERE id=ANY(doc_ids);
  IF NOT brick_private.identity_evidence_ready(u.id) THEN RAISE EXCEPTION 'Complete current identity evidence could not be confirmed. No approval was saved.'; END IF;
  UPDATE public.users SET role='seller',kyc_status='approved',seller_status='active' WHERE id=u.id;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=u.id AND role::text='seller' AND kyc_status::text='approved' AND seller_status::text='active') THEN
   RAISE EXCEPTION 'Seller activation could not be confirmed. No application approval was saved.';
  END IF;
 ELSE
  UPDATE public.documents SET status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),rejection_reason=note WHERE id=ANY(doc_ids);
  UPDATE public.users SET role='buyer',kyc_status='rejected',seller_status='basic' WHERE id=u.id;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=u.id AND role::text='buyer' AND kyc_status::text='rejected') THEN
   RAISE EXCEPTION 'Application rejection could not be confirmed. No decision was saved.';
  END IF;
 END IF;
 INSERT INTO public.account_security_events(id,actor_auth_id,user_id,action,details)
  VALUES(application_id,auth.uid(),u.id,'identity_application_reviewed',jsonb_build_object('approved',p_approve,'note',trim(p_note),
   'required_action',CASE WHEN p_approve THEN NULL ELSE trim(p_required_action) END,'application',current_application));
 -- Existing retention checks consume these per-file audit references. All of
 -- them belong to the same consolidated decision, not separate admin actions.
 FOR entry IN SELECT value FROM jsonb_array_elements(current_application->'documents') LOOP
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
   VALUES(auth.uid(),u.id,'identity_document_reviewed',jsonb_build_object('application_id',application_id,'document_id',entry->>'id',
    'document_path',entry->>'document_url','document_type',(SELECT document_type::text FROM public.documents WHERE id=(entry->>'id')::uuid),'approved',p_approve,'note',note));
 END LOOP;
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
  VALUES(u.id,CASE WHEN p_approve THEN 'Seller application approved' ELSE 'Seller application rejected' END,
   CASE WHEN p_approve THEN 'Your identity, selfie and owner/builder declaration were approved together. Seller access is now active. Each property still needs separate ownership and listing approval.'
    ELSE note||E'\nUpload the requested corrected evidence on Profile. Your application will return to the KYC queue for a consolidated review.' END,
   'seller','seller','/profile#seller-access','View seller application','user',u.id);
 RETURN jsonb_build_object('application_id',application_id,'approved',p_approve,'seller_active',p_approve);
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'This application is being updated. Reload the current evidence and retry your decision.' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION brick_private.identity_application_snapshot(uuid),brick_private.pending_identity_applicants() FROM PUBLIC,anon,authenticated;
-- Retain the old routine for historical definitions, but ordinary API callers
-- can no longer make individual document decisions outside the application RPC.
REVOKE ALL ON FUNCTION public.review_identity_document(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.count_pending_identity_applications(),public.get_pending_identity_applications(integer),public.review_identity_application(uuid,boolean,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.count_pending_identity_applications(),public.get_pending_identity_applications(integer),public.review_identity_application(uuid,boolean,text,jsonb,text) TO authenticated;
COMMIT;
