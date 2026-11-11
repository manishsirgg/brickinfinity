-- Run this entire file as one statement in Supabase SQL Editor.
-- Requires the owner-only verification and reviewed-declaration migrations.
-- Retires only the three confirmed legacy verification authorities. Keeps their
-- functions and records original definitions for inspection. No auto-publication.
DO $retire_legacy_verification$
DECLARE target record; binding record; candidate record; proof record;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 LOCK TABLE public.users,public.documents,public.properties IN SHARE ROW EXCLUSIVE MODE;
 CREATE TABLE IF NOT EXISTS brick_private.retired_verification_triggers (
  table_schema text NOT NULL,table_name text NOT NULL,trigger_name text NOT NULL,
  trigger_definition text NOT NULL,function_name text NOT NULL,
  retired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(table_schema,table_name,trigger_name)
 );
 REVOKE ALL ON brick_private.retired_verification_triggers FROM PUBLIC,anon,authenticated;
 FOR target IN SELECT * FROM (VALUES
  ('documents','sync_property_ownership_trigger','sync_property_ownership_state'),
  ('documents','sync_user_verification_trigger','sync_user_verification_state'),
  ('users','on_kyc_status_update','auto_approve_seller')
 ) AS expected(table_name,trigger_name,function_name) LOOP
  SELECT t.oid,pg_get_triggerdef(t.oid) AS definition,nf.nspname AS function_schema,
   f.proname,f.pronargs INTO binding
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc f ON f.oid=t.tgfoid JOIN pg_namespace nf ON nf.oid=f.pronamespace
  WHERE n.nspname='public' AND c.relname=target.table_name
   AND t.tgname=target.trigger_name AND NOT t.tgisinternal;
  IF FOUND THEN
   IF binding.function_schema<>'public' OR binding.proname<>target.function_name OR binding.pronargs<>0 THEN
    RAISE EXCEPTION 'Unexpected function on legacy trigger %.%; no changes applied',target.table_name,target.trigger_name;
   END IF;
   INSERT INTO brick_private.retired_verification_triggers
    (table_schema,table_name,trigger_name,trigger_definition,function_name)
    VALUES('public',target.table_name,target.trigger_name,binding.definition,'public.'||binding.proname)
    ON CONFLICT DO NOTHING;
   EXECUTE format('DROP TRIGGER %I ON public.%I',target.trigger_name,target.table_name);
  END IF;
 END LOOP;
 -- Preserve the canonical invalidation rules; make future status changes auditable.
 EXECUTE $account_function$
CREATE OR REPLACE FUNCTION brick_private.account_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status OR NEW.seller_status IS DISTINCT FROM OLD.seller_status OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity THEN
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),NEW.id,'account_permissions_changed',jsonb_build_object('old_role',OLD.role,'new_role',NEW.role,'old_kyc',OLD.kyc_status,'new_kyc',NEW.kyc_status,'seller_identity',NEW.seller_identity,'old_seller_identity',OLD.seller_identity,'old_seller_status',OLD.seller_status,'new_seller_status',NEW.seller_status));
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
$account_function$;
 -- Replay an existing explicit staff activation only when every later permission
 -- change is explained by the old ownership-review trigger in that same transaction.
 -- Never promote an unreviewed, revoked, demoted or suspended account.
 FOR candidate IN
  SELECT u.id,a.id AS activation_id FROM public.users u
  JOIN LATERAL (
   SELECT e.id,e.created_at FROM public.account_security_events e
   WHERE e.user_id=u.id AND e.action='seller_activation_reviewed'
   ORDER BY e.created_at DESC LIMIT 1
  ) a ON true
  WHERE u.role::text='seller' AND u.kyc_status::text='approved'
   AND u.seller_status::text='verified' AND u.owner_declaration_at IS NOT NULL
   AND u.seller_identity IN ('owner','project_owner_builder')
   AND brick_private.identity_evidence_ready(u.id)
   AND NOT EXISTS (
    SELECT 1 FROM public.account_security_events e
    WHERE e.user_id=u.id AND e.action='account_permissions_changed' AND e.created_at>a.created_at
    AND (
     e.details->>'old_role'='seller' AND e.details->>'new_role'='seller'
     AND e.details->>'old_kyc'='approved' AND e.details->>'new_kyc'='approved'
     AND coalesce(e.details->>'new_seller_status','verified')='verified'
     AND EXISTS(SELECT 1 FROM public.ownership_reviews r JOIN public.properties p ON p.id=r.property_id
      WHERE p.seller_id=u.id AND r.decision='approved' AND r.created_at=e.created_at
       AND r.reviewer_auth_id=e.actor_auth_id)
    ) IS NOT TRUE
   )
 LOOP
  UPDATE public.users SET seller_status='active' WHERE id=candidate.id;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=candidate.id AND role::text='seller'
   AND kyc_status::text='approved' AND seller_status::text='active') THEN
   RAISE EXCEPTION 'Another trigger prevented audited seller restoration; entire migration rolled back';
  END IF;
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
   VALUES(auth.uid(),candidate.id,'legacy_seller_activation_restored',
    jsonb_build_object('activation_event_id',candidate.activation_id,'old_seller_status','verified','new_seller_status','active'));
 END LOOP;
 -- Restore only the exact file/owner/checklist already approved in an immutable
 -- review whose timestamp still matches the property's current approval.
 FOR proof IN
  SELECT d.id AS document_id,d.user_id,r.id AS review_id,r.created_at,r.reviewer_auth_id,p.id AS property_id
  FROM public.documents d JOIN public.properties p ON p.id=d.property_id
   JOIN public.users u ON u.id=p.seller_id
   JOIN public.ownership_reviews r ON r.document_id=d.id AND r.property_id=p.id
    AND r.created_at=p.ownership_reviewed_at AND r.decision='approved'
  WHERE d.document_type::text='ownership' AND d.status::text='pending' AND d.reviewed_at IS NULL
   AND p.deleted_at IS NULL AND p.ownership_verified AND p.ownership_review_status='approved'
   AND d.user_id=p.seller_id AND r.document_path=d.document_url
   AND r.owner_kind IS NOT DISTINCT FROM p.owner_kind
   AND r.owner_legal_name IS NOT DISTINCT FROM p.owner_legal_name
   AND r.project_name IS NOT DISTINCT FROM p.owner_project_name AND p.owner_attested
   AND r.checks @> '{"identity_matches":true,"property_matches":true,"owns_property":true,"no_agent":true}'::jsonb
   AND (p.owner_kind='owner' OR (p.owner_kind='project_owner_builder' AND r.checks @> '{"company_owns_project":true}'::jsonb))
   AND u.kyc_status::text='approved' AND (u.role::text='admin' OR
    (u.role::text='seller' AND u.seller_status::text='active' AND u.owner_declaration_at IS NOT NULL))
   AND brick_private.identity_evidence_ready(u.id)
   AND EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='ownership-documents' AND name=d.document_url)
 LOOP
  UPDATE public.documents SET status='approved',reviewed_at=proof.created_at,
   reviewed_by=proof.reviewer_auth_id,rejection_reason=NULL WHERE id=proof.document_id;
  IF NOT EXISTS(SELECT 1 FROM public.documents d JOIN public.properties p ON p.id=d.property_id
   WHERE d.id=proof.document_id AND d.status::text='approved' AND d.reviewed_at=proof.created_at
    AND d.reviewed_by=proof.reviewer_auth_id AND p.ownership_verified
    AND p.ownership_review_status='approved' AND p.ownership_reviewed_at=proof.created_at) THEN
   RAISE EXCEPTION 'Another trigger prevented audited ownership restoration; entire migration rolled back';
  END IF;
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details)
   VALUES(auth.uid(),proof.user_id,'legacy_ownership_state_reconciled',
    jsonb_build_object('document_id',proof.document_id,'property_id',proof.property_id,'original_review_id',proof.review_id));
 END LOOP;
END;
$retire_legacy_verification$;
