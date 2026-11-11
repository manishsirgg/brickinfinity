-- READ ONLY. Run this complete query in Supabase SQL Editor and share the JSON
-- result. It does not approve, publish, activate, delete or modify anything.
-- No document paths, signed URLs, credentials, emails or phone numbers are read.
WITH target AS (
 SELECT p.* FROM public.properties p
 WHERE p.id='f0aeee08-6dce-44ae-9e3c-f467dc6fb059'::uuid
), seller AS (
 SELECT u.* FROM public.users u JOIN target p ON p.seller_id=u.id
)
SELECT jsonb_pretty(jsonb_build_object(
 'property', (SELECT jsonb_build_object(
   'id',p.id,'status',p.status,'verification_status',p.verification_status,
   'ownership_verified',p.ownership_verified,'ownership_review_status',p.ownership_review_status,
   'ownership_reviewed_at',p.ownership_reviewed_at,'listing_reviewed_at',p.listing_reviewed_at,
   'listing_source',p.listing_source,'owner_kind',p.owner_kind,'owner_attested',p.owner_attested,
   'is_deleted',p.deleted_at IS NOT NULL) FROM target p),
 'actual_listing_seller', (SELECT jsonb_build_object(
   'profile_id',u.id,'role',u.role,'kyc_status',u.kyc_status,'seller_status',u.seller_status,
   'seller_identity',u.seller_identity,'has_owner_declaration',u.owner_declaration_at IS NOT NULL,
   'declaration_locked',u.declaration_locked_at IS NOT NULL) FROM seller u),
 'identity_documents',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'document_type',d.document_type,'status',d.status,'reviewed_at',d.reviewed_at) ORDER BY d.created_at DESC,d.id DESC)
   FROM public.documents d JOIN seller u ON u.id=d.user_id WHERE d.property_id IS NULL),'[]'::jsonb),
 'ownership_documents', coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',d.id,'status',d.status,'created_at',d.created_at,'reviewed_at',d.reviewed_at,
   'matches_listing_seller',d.user_id=p.seller_id) ORDER BY d.created_at DESC,d.id DESC)
   FROM public.documents d JOIN target p ON p.id=d.property_id WHERE d.document_type::text='ownership'),'[]'::jsonb),
 'recent_ownership_decisions', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
   SELECT r.document_id,r.decision,r.created_at FROM public.ownership_reviews r JOIN target p ON p.id=r.property_id ORDER BY r.created_at DESC LIMIT 8
 ) r),'[]'::jsonb),
 'recent_account_transitions',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (
   SELECT e.action,e.created_at,e.details->>'old_role' AS old_role,e.details->>'new_role' AS new_role,
     e.details->>'old_kyc' AS old_kyc,e.details->>'new_kyc' AS new_kyc,
     e.details->>'old_seller_status' AS old_seller_status,e.details->>'new_seller_status' AS new_seller_status
   FROM public.account_security_events e JOIN seller u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 15
 ) e),'[]'::jsonb),
 'review_related_triggers',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,
   'function',n.nspname||'.'||f.proname,'arguments',pg_get_function_identity_arguments(f.oid),
   'security_definer',f.prosecdef,'function_owner',pg_get_userbyid(f.proowner),'settings',f.proconfig,
   'references_account_status',f.prosrc ~* '(seller_status|kyc_status)',
   'references_ownership',f.prosrc ~* '(ownership|verification_status)',
   'references_documents',f.prosrc ~* '(documents|document_type)') ORDER BY c.relname,t.tgname)
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace
   JOIN pg_proc f ON f.oid=t.tgfoid JOIN pg_namespace n ON n.oid=f.pronamespace
   WHERE cn.nspname='public' AND c.relname IN ('users','documents','properties') AND NOT t.tgisinternal),'[]'::jsonb),
 'installed_review_routines',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'function',n.nspname||'.'||f.proname,'arguments',pg_get_function_identity_arguments(f.oid),
   'security_definer',f.prosecdef,'function_owner',pg_get_userbyid(f.proowner),'settings',f.proconfig,
   'body_fingerprint',md5(f.prosrc)) ORDER BY n.nspname,f.proname)
   FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE
   (n.nspname='public' AND f.proname IN ('review_property_ownership','admin_publish_property','review_identity_document')) OR
   (n.nspname='brick_private' AND f.proname IN ('guard_property','account_changed','evidence_resubmitted','reopen_owner_evidence'))),'[]'::jsonb)
)) AS ownership_review_diagnostic;
