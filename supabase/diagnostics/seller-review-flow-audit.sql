-- READ ONLY. Run as the database owner in Supabase SQL Editor after the current
-- migrations. This returns counts/configuration only: no names, IDs or file paths.
-- All critical_checks should be true. Queue counts can legitimately be zero.
SELECT jsonb_pretty(jsonb_build_object(
 'critical_checks',jsonb_build_object(
  'old_verification_triggers_retired',NOT EXISTS(
   SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('users','documents') AND t.tgenabled<>'D'
    AND t.tgname IN ('sync_property_ownership_trigger','sync_user_verification_trigger','on_kyc_status_update')),
  'ownership_version_constraint_removed',to_regclass('public.documents_property_type_unique') IS NULL,
  'checked_review_routines_present',to_regprocedure('public.review_identity_document(uuid,boolean,text)') IS NOT NULL
   AND to_regprocedure('public.review_property_ownership(uuid,boolean,jsonb,text)') IS NOT NULL
   AND to_regprocedure('public.reject_property_review(uuid,text,text,text,text,uuid)') IS NOT NULL
   AND to_regprocedure('public.resubmit_property_review(uuid)') IS NOT NULL
   AND to_regprocedure('public.admin_publish_property(uuid)') IS NOT NULL,
  'ownership_approval_waits_for_resubmission',EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.review_property_ownership(uuid,boolean,jsonb,text)') AND prosrc LIKE '%seller must resubmit%'),
  'public_visibility_restrictive_policies_present',(SELECT count(*)=2 FROM pg_policy WHERE polrelid='public.properties'::regclass AND polname IN ('owner_public_read_anon','owner_public_read_authenticated') AND NOT polpermissive AND polcmd='r'),
  'explicit_draft_guard_enabled',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.properties'::regclass AND tgname='zz_guard_review_submission' AND tgenabled<>'D'),
  'review_and_evidence_rls_enabled',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname IN ('users','properties','documents','property_review_requests') AND NOT c.relrowsecurity),
  'evidence_buckets_private',(SELECT count(*)=3 AND bool_and(NOT public) FROM storage.buckets WHERE id IN ('identity-documents','ownership-documents','declaration-documents')),
  'no_drafts_in_review_queues',NOT EXISTS(SELECT 1 FROM public.properties WHERE review_resubmission_required AND status::text<>'rejected' AND deleted_at IS NULL),
  'active_sellers_have_identity_and_declaration',NOT EXISTS(SELECT 1 FROM public.users u WHERE role::text='seller' AND seller_status::text='active'
   AND (kyc_status::text='approved' AND owner_declaration_at IS NOT NULL AND seller_identity IN ('owner','project_owner_builder') AND brick_private.identity_evidence_ready(u.id)) IS NOT TRUE),
  'published_owner_properties_have_completed_reviews',NOT EXISTS(SELECT 1 FROM public.properties p JOIN public.users u ON u.id=p.seller_id
   WHERE p.status::text='active' AND p.verification_status::text='approved' AND p.deleted_at IS NULL AND u.role::text<>'admin'
    AND (brick_private.public_listing(p.id) AND p.listing_reviewed_at IS NOT NULL AND NOT p.review_resubmission_required) IS NOT TRUE)
 ),
 'queues',jsonb_build_object(
  'kyc_pending_documents',(SELECT count(*) FROM public.documents WHERE property_id IS NULL AND document_type::text IN ('aadhar','passport','driving_license','selfie') AND status::text='pending'),
  'kyc_pending_applicants',(SELECT count(DISTINCT user_id) FROM public.documents WHERE property_id IS NULL AND document_type::text IN ('aadhar','passport','driving_license','selfie') AND status::text='pending'),
  'ownership_pending_properties',(SELECT count(*) FROM public.properties p WHERE p.status::text='pending' AND NOT p.ownership_verified
   AND p.ownership_review_status='unreviewed' AND p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.documents d WHERE d.property_id=p.id AND d.user_id=p.seller_id AND d.document_type::text='ownership' AND d.status::text='pending')),
  'ready_for_publication',(SELECT count(*) FROM public.properties WHERE status::text='pending' AND deleted_at IS NULL
   AND ((ownership_verified AND verification_status::text IN ('ownership_approved','approved')) OR listing_source='brickinfinity_admin')),
  'awaiting_seller_corrections',(SELECT count(*) FROM public.properties WHERE review_resubmission_required AND deleted_at IS NULL),
  'published_owner_properties',(SELECT count(*) FROM public.properties p JOIN public.users u ON u.id=p.seller_id WHERE p.status::text='active' AND p.verification_status::text='approved' AND p.deleted_at IS NULL AND u.role::text<>'admin'),
  'published_admin_properties',(SELECT count(*) FROM public.properties p JOIN public.users u ON u.id=p.seller_id WHERE p.status::text='active' AND p.verification_status::text='approved' AND p.deleted_at IS NULL AND u.role::text='admin')
 )
)) AS seller_review_flow_audit;
