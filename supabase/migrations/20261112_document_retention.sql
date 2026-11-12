-- Install after consolidated KYC and the existing owner-only review migrations.
-- No files/records are deleted by this migration. Binary deletion uses Storage API.
BEGIN;
CREATE TABLE IF NOT EXISTS public.document_retention_policy (
 id integer PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT true,
 orphan_hours integer NOT NULL DEFAULT 48 CHECK(orphan_hours>=48),
 unreviewed_days integer NOT NULL DEFAULT 7 CHECK(unreviewed_days>=7),
 backfill_complete boolean NOT NULL DEFAULT false,reviewed_days integer CHECK(reviewed_days BETWEEN 30 AND 3650),created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.document_retention_policy(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.document_retention_files (
 bucket_id text NOT NULL CHECK(bucket_id IN ('identity-documents','ownership-documents','declaration-documents')),path text NOT NULL,
 state text NOT NULL DEFAULT 'available' CHECK(state IN ('available','deleting','deleted')),
 legacy_protected boolean NOT NULL DEFAULT false,hold boolean NOT NULL DEFAULT false,hold_reason text,released_at timestamptz,release_reason text,
 object_id uuid,object_created_at timestamptz,size_bytes bigint,sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
 reason text,requested_by uuid,attempts integer NOT NULL DEFAULT 0,token uuid,lease_until timestamptz,last_error text,deleted_at timestamptz,
 PRIMARY KEY(bucket_id,path)
);
CREATE TABLE IF NOT EXISTS public.document_retention_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,path text,action text NOT NULL,
 actor_auth_id uuid,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_retention_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_retention_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_retention_policy,public.document_retention_files,public.document_retention_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.document_retention_policy,public.document_retention_files,public.document_retention_events TO authenticated,service_role;
DROP POLICY IF EXISTS retention_policy_admin ON public.document_retention_policy;
CREATE POLICY retention_policy_admin ON public.document_retention_policy FOR SELECT TO authenticated USING(brick_private.is_admin());
DROP POLICY IF EXISTS retention_files_admin ON public.document_retention_files;
CREATE POLICY retention_files_admin ON public.document_retention_files FOR SELECT TO authenticated USING(brick_private.is_admin());
DROP POLICY IF EXISTS retention_events_admin ON public.document_retention_events;
CREATE POLICY retention_events_admin ON public.document_retention_events FOR SELECT TO authenticated USING(brick_private.is_admin());
CREATE OR REPLACE FUNCTION brick_private.retention_available(p_bucket text,p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path)
 AND NOT EXISTS(SELECT 1 FROM public.document_retention_files WHERE bucket_id=p_bucket AND path=p_path AND (released_at IS NOT NULL OR state IN ('deleting','deleted')))
$$;
CREATE OR REPLACE FUNCTION brick_private.retention_contains(data jsonb,p_path text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_path_exists(coalesce(data,'null'::jsonb),'$.** ? (@ == $file)',jsonb_build_object('file',p_path)),false)
$$;
CREATE OR REPLACE FUNCTION brick_private.retention_current(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.document_url=p_path AND (
  d.status::text='pending' OR
  (d.property_id IS NULL AND d.id=(SELECT id FROM public.documents latest WHERE latest.user_id=d.user_id AND latest.property_id IS NULL AND latest.document_type=d.document_type ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1)) OR
  (d.property_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.properties p WHERE p.id=d.property_id AND p.deleted_at IS NULL
   AND d.id=(SELECT id FROM public.documents latest WHERE latest.property_id=p.id AND latest.user_id=p.seller_id AND latest.document_type::text='ownership' ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1)))))
 OR EXISTS(SELECT 1 FROM public.ownership_reviews r JOIN public.properties p ON p.id=r.property_id WHERE p.deleted_at IS NULL
  AND (r.document_path=p_path OR brick_private.retention_contains(r.checks,p_path)))
 OR EXISTS(SELECT 1 FROM public.property_review_requests r JOIN public.properties p ON p.review_rejection_id=r.id
  WHERE p.deleted_at IS NULL AND p.review_resubmission_required AND brick_private.retention_contains(r.snapshot,p_path))
 OR EXISTS(SELECT 1 FROM public.declaration_change_requests r WHERE (r.status='pending' OR (r.status='approved'
  AND r.id=(SELECT id FROM public.declaration_change_requests latest WHERE latest.user_id=r.user_id AND latest.status='approved' ORDER BY reviewed_at DESC NULLS LAST,id DESC LIMIT 1)))
  AND (p_path=ANY(r.evidence_paths) OR brick_private.retention_contains(r.review_checks,p_path)))
$$;
CREATE OR REPLACE FUNCTION brick_private.retention_referenced(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents WHERE document_url=p_path)
 OR EXISTS(SELECT 1 FROM public.document_retention_files f WHERE f.path=p_path AND (f.hold OR f.state IN ('deleting','deleted')))
 OR EXISTS(SELECT 1 FROM public.document_versions WHERE document_url=p_path)
 OR EXISTS(SELECT 1 FROM public.ownership_reviews WHERE document_path=p_path OR brick_private.retention_contains(checks,p_path))
 OR EXISTS(SELECT 1 FROM public.account_security_events WHERE brick_private.retention_contains(details,p_path))
 OR EXISTS(SELECT 1 FROM public.property_review_requests WHERE brick_private.retention_contains(snapshot,p_path))
 OR EXISTS(SELECT 1 FROM public.declaration_change_requests WHERE p_path=ANY(evidence_paths) OR brick_private.retention_contains(review_checks,p_path))
$$;
CREATE OR REPLACE FUNCTION brick_private.retention_reviewed(p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.documents WHERE document_url=p_path AND (reviewed_at IS NOT NULL OR status::text IN ('approved','rejected')))
 OR EXISTS(SELECT 1 FROM public.ownership_reviews WHERE document_path=p_path OR brick_private.retention_contains(checks,p_path))
 OR EXISTS(SELECT 1 FROM public.account_security_events WHERE action IN ('identity_document_reviewed','identity_application_reviewed') AND brick_private.retention_contains(details,p_path))
 OR EXISTS(SELECT 1 FROM public.property_review_requests WHERE brick_private.retention_contains(snapshot,p_path))
 OR EXISTS(SELECT 1 FROM public.declaration_change_requests WHERE status IN ('approved','rejected') AND (p_path=ANY(evidence_paths) OR brick_private.retention_contains(review_checks,p_path)))
$$;
CREATE OR REPLACE FUNCTION brick_private.retention_reason(bucket text,file text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy public.document_retention_policy%ROWTYPE;item public.document_retention_files%ROWTYPE;created timestamptz;referenced boolean;
BEGIN
 IF bucket NOT IN ('identity-documents','ownership-documents','declaration-documents') THEN RETURN NULL; END IF;
 SELECT * INTO policy FROM public.document_retention_policy WHERE id=1;
 IF NOT policy.enabled THEN RETURN NULL; END IF;
 SELECT * INTO item FROM public.document_retention_files WHERE bucket_id=bucket AND path=file;
 IF item.hold OR item.state IN ('deleting','deleted') THEN RETURN NULL; END IF;
 SELECT created_at INTO created FROM storage.objects WHERE bucket_id=bucket AND name=file;
 IF NOT FOUND OR created IS NULL OR brick_private.retention_current(file) THEN RETURN NULL; END IF;
 referenced:=brick_private.retention_referenced(file);
 IF NOT referenced AND NOT coalesce(item.legacy_protected,false) AND created<now()-make_interval(hours=>policy.orphan_hours) THEN RETURN 'orphan_upload'; END IF;
 -- Unknown legacy referenced history is treated as reviewed, never guessed disposable.
 IF coalesce(item.legacy_protected,false) OR brick_private.retention_reviewed(file) OR (referenced AND created<policy.created_at) THEN
  IF policy.reviewed_days IS NOT NULL AND item.released_at IS NOT NULL
   AND item.released_at<now()-make_interval(days=>policy.reviewed_days) THEN RETURN 'reviewed_history_expired'; END IF;
  RETURN NULL;
 END IF;
 IF referenced AND created<now()-make_interval(days=>policy.unreviewed_days) THEN RETURN 'superseded_unreviewed'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION brick_private.retention_lock(bucket text,file text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(file,82731));
 IF EXISTS(SELECT 1 FROM public.document_retention_files WHERE path=file AND (state IN ('deleting','deleted') OR released_at IS NOT NULL)) THEN
  RAISE EXCEPTION 'This evidence file is expired or scheduled for deletion. Upload a new file instead.' USING ERRCODE='23514';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION brick_private.guard_retention_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE value text;payload jsonb;row_data jsonb;
BEGIN
 row_data:=to_jsonb(NEW);
 payload:=CASE TG_TABLE_NAME
  WHEN 'documents' THEN jsonb_build_array(row_data->'document_url')
  WHEN 'document_versions' THEN jsonb_build_array(row_data->'document_url')
  WHEN 'ownership_reviews' THEN jsonb_build_array(row_data->'document_path',row_data->'checks')
  WHEN 'account_security_events' THEN (row_data->'details')-ARRAY['note','reason','required_action']
  WHEN 'property_review_requests' THEN row_data->'snapshot'->'evidence'
  WHEN 'declaration_change_requests' THEN jsonb_build_array(row_data->'evidence_paths',row_data->'review_checks')
  ELSE '[]'::jsonb END;
 -- Stable lock order, including nested review snapshots. Relative paths always contain '/'.
 FOR value IN SELECT DISTINCT v #>> '{}' FROM jsonb_path_query(payload,'$.** ? (@.type() == "string")') v
  WHERE length(v #>> '{}')<2000 AND (v #>> '{}') LIKE '%/%' ORDER BY 1 LOOP
  PERFORM brick_private.retention_lock('',value);
  INSERT INTO public.document_retention_files(bucket_id,path,legacy_protected)
   SELECT o.bucket_id,o.name,true FROM storage.objects o CROSS JOIN public.document_retention_policy policy
   WHERE policy.id=1 AND o.name=value AND o.bucket_id IN ('identity-documents','ownership-documents','declaration-documents') AND o.created_at<policy.created_at
   ON CONFLICT(bucket_id,path) DO UPDATE SET legacy_protected=true;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE target record; BEGIN
 FOR target IN SELECT * FROM (VALUES
  ('documents','document_url,status'),('document_versions','document_url'),('ownership_reviews','document_path,checks'),
  ('account_security_events','details'),('property_review_requests','snapshot'),('declaration_change_requests','evidence_paths,review_checks')) AS t(table_name,columns) LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS zz_guard_retention_references ON public.%I',target.table_name);
  EXECUTE format('CREATE TRIGGER zz_guard_retention_references BEFORE INSERT OR UPDATE OF %s ON public.%I FOR EACH ROW EXECUTE FUNCTION brick_private.guard_retention_references()',target.columns,target.table_name);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION brick_private.guard_retention_storage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.bucket_id IN ('identity-documents','ownership-documents','declaration-documents') THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(OLD.name,82731));
   IF EXISTS(SELECT 1 FROM public.document_retention_files WHERE bucket_id=OLD.bucket_id AND path=OLD.name
    AND state='deleting' AND reason='reviewed_history_expired' AND sha256 IS NULL) THEN
    RAISE EXCEPTION 'Record the reviewed evidence checksum before deletion.';
   END IF;
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['last_accessed_at','updated_at']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['last_accessed_at','updated_at']) THEN RETURN NEW; END IF;
 IF NEW.bucket_id IN ('identity-documents','ownership-documents','declaration-documents') THEN PERFORM brick_private.retention_lock(NEW.bucket_id,NEW.name); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_guard_retention_storage ON storage.objects;
CREATE TRIGGER zz_guard_retention_storage BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION brick_private.guard_retention_storage();
-- Authenticated clients, including staff UI sessions, cannot delete/overwrite referenced
-- evidence. Only the controlled service worker performs expiry through Storage API.
REVOKE ALL ON FUNCTION brick_private.retention_referenced(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION brick_private.retention_referenced(text) TO authenticated;
DROP POLICY IF EXISTS retain_all_referenced_evidence_delete ON storage.objects;
CREATE POLICY retain_all_referenced_evidence_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id NOT IN ('identity-documents','ownership-documents','declaration-documents') OR NOT brick_private.retention_referenced(name));
DROP POLICY IF EXISTS retain_all_referenced_evidence_update ON storage.objects;
CREATE POLICY retain_all_referenced_evidence_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id NOT IN ('identity-documents','ownership-documents','declaration-documents') OR NOT brick_private.retention_referenced(name))
 WITH CHECK(bucket_id NOT IN ('identity-documents','ownership-documents','declaration-documents') OR NOT brick_private.retention_referenced(name));
CREATE OR REPLACE FUNCTION public.inventory_document_retention(p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(item)),'[]'::jsonb) FROM
 (SELECT o.bucket_id,o.name AS path,o.created_at,
  CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$' THEN (o.metadata->>'size')::bigint ELSE NULL END AS size_bytes,
  brick_private.retention_current(o.name) AS current,
  (coalesce(f.legacy_protected,false) OR brick_private.retention_reviewed(o.name) OR (brick_private.retention_referenced(o.name) AND o.created_at<(SELECT created_at FROM public.document_retention_policy WHERE id=1))) AS history,
  coalesce(f.hold,false) AS hold,f.released_at,f.state
 FROM storage.objects o LEFT JOIN public.document_retention_files f ON f.bucket_id=o.bucket_id AND f.path=o.name
 WHERE o.bucket_id IN ('identity-documents','ownership-documents','declaration-documents')
 ORDER BY o.created_at,o.id LIMIT 100 OFFSET greatest(0,least(coalesce(p_offset,0),100000))) item
$$;
CREATE OR REPLACE FUNCTION public.preview_document_retention(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) FROM
 (SELECT o.bucket_id,o.name AS path,brick_private.retention_reason(o.bucket_id,o.name) AS reason,o.created_at,
  CASE WHEN o.metadata->>'size' ~ '^[0-9]{1,18}$' THEN (o.metadata->>'size')::bigint ELSE NULL END AS size_bytes
 FROM storage.objects o WHERE o.bucket_id IN ('identity-documents','ownership-documents','declaration-documents')
  AND o.created_at<now()-interval '48 hours' AND brick_private.retention_reason(o.bucket_id,o.name) IS NOT NULL
 ORDER BY o.created_at,o.id LIMIT greatest(1,least(coalesce(p_limit,50),100))) candidate
$$;
CREATE OR REPLACE FUNCTION public.claim_document_retention(p_limit integer DEFAULT 20,p_actor uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item record;reason text;claims jsonb:='[]';claim_token uuid;
BEGIN
 IF p_actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.users WHERE user_id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Staff admin required.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.document_retention_policy WHERE id=1 AND enabled) THEN RETURN claims; END IF;
 -- Resume unfinished deletions even when the Storage API already removed the object.
 FOR item IN SELECT bucket_id,path FROM public.document_retention_files WHERE state='deleting' AND attempts<5 AND lease_until<now() ORDER BY lease_until LIMIT greatest(1,least(coalesce(p_limit,20),50)) FOR UPDATE SKIP LOCKED LOOP
  IF NOT pg_try_advisory_xact_lock(hashtextextended(item.path,82731)) THEN CONTINUE; END IF;
  claim_token:=gen_random_uuid();
  UPDATE public.document_retention_files SET token=claim_token,requested_by=coalesce(p_actor,requested_by),attempts=attempts+1,lease_until=now()+interval '10 minutes',last_error=NULL WHERE bucket_id=item.bucket_id AND path=item.path;
  INSERT INTO public.document_retention_events(bucket_id,path,action,actor_auth_id) VALUES(item.bucket_id,item.path,'cleanup_resumed',p_actor);
  claims:=claims||jsonb_build_array((SELECT to_jsonb(f)||jsonb_build_object('object_missing',NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id=f.bucket_id AND o.name=f.path)) FROM public.document_retention_files f WHERE f.bucket_id=item.bucket_id AND f.path=item.path));
 END LOOP;
 FOR item IN SELECT o.* FROM storage.objects o WHERE o.bucket_id IN ('identity-documents','ownership-documents','declaration-documents') AND o.created_at<now()-interval '48 hours'
  ORDER BY o.created_at,o.id LOOP
  EXIT WHEN jsonb_array_length(claims)>=greatest(1,least(coalesce(p_limit,20),50));
  IF NOT pg_try_advisory_xact_lock(hashtextextended(item.name,82731)) THEN CONTINUE; END IF;
  reason:=brick_private.retention_reason(item.bucket_id,item.name);
  IF reason IS NULL THEN CONTINUE; END IF;
  claim_token:=gen_random_uuid();
  INSERT INTO public.document_retention_files(bucket_id,path,state,object_id,object_created_at,size_bytes,reason,requested_by,attempts,token,lease_until)
   VALUES(item.bucket_id,item.name,'deleting',item.id,item.created_at,CASE WHEN item.metadata->>'size' ~ '^[0-9]{1,18}$' THEN (item.metadata->>'size')::bigint ELSE NULL END,reason,p_actor,1,claim_token,now()+interval '10 minutes')
   ON CONFLICT(bucket_id,path) DO UPDATE SET state='deleting',object_id=EXCLUDED.object_id,object_created_at=EXCLUDED.object_created_at,size_bytes=EXCLUDED.size_bytes,reason=EXCLUDED.reason,requested_by=EXCLUDED.requested_by,attempts=EXCLUDED.attempts,token=EXCLUDED.token,lease_until=EXCLUDED.lease_until,last_error=NULL
   WHERE document_retention_files.state='available' AND NOT document_retention_files.hold;
  IF NOT FOUND THEN CONTINUE; END IF;
  INSERT INTO public.document_retention_events(bucket_id,path,action,actor_auth_id,details) VALUES(item.bucket_id,item.name,'cleanup_claimed',p_actor,jsonb_build_object('reason',reason,'object_id',item.id));
  claims:=claims||jsonb_build_array((SELECT to_jsonb(f) FROM public.document_retention_files f WHERE f.bucket_id=item.bucket_id AND f.path=item.name));
 END LOOP;
 RETURN claims;
END $$;
CREATE OR REPLACE FUNCTION public.finish_document_retention(p_bucket text,p_path text,p_token uuid,p_sha256 text DEFAULT NULL,p_error text DEFAULT NULL,p_prepare boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item public.document_retention_files%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_path,82731));
 SELECT * INTO item FROM public.document_retention_files WHERE bucket_id=p_bucket AND path=p_path FOR UPDATE;
 IF NOT FOUND OR item.state<>'deleting' OR item.token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'Cleanup claim is stale.'; END IF;
 IF p_error IS NOT NULL THEN
  UPDATE public.document_retention_files SET last_error=left(p_error,500),lease_until=now()+interval '1 hour' WHERE bucket_id=p_bucket AND path=p_path;
  INSERT INTO public.document_retention_events(bucket_id,path,action,details) VALUES(p_bucket,p_path,'cleanup_failed',jsonb_build_object('error',left(p_error,500)));
  RETURN;
 END IF;
 IF p_prepare THEN
  IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Valid SHA-256 required.'; END IF;
  UPDATE public.document_retention_files SET sha256=p_sha256 WHERE bucket_id=p_bucket AND path=p_path;
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path) THEN RAISE EXCEPTION 'Storage deletion is not confirmed.'; END IF;
 IF item.reason='reviewed_history_expired' AND item.sha256 IS NULL THEN RAISE EXCEPTION 'Reviewed file checksum must be recorded before deletion.'; END IF;
 UPDATE public.document_retention_files SET state='deleted',deleted_at=now(),lease_until=NULL,last_error=NULL WHERE bucket_id=p_bucket AND path=p_path;
 INSERT INTO public.document_retention_events(bucket_id,path,action,actor_auth_id,details) VALUES(p_bucket,p_path,'file_deleted',item.requested_by,jsonb_build_object('reason',item.reason,'size_bytes',item.size_bytes,'sha256',item.sha256,'object_id',item.object_id));
END $$;
CREATE OR REPLACE FUNCTION public.configure_document_retention(p_actor uuid,p_enabled boolean,p_reviewed_days integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE user_id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Staff admin required.'; END IF;
 UPDATE public.document_retention_policy SET enabled=p_enabled,reviewed_days=p_reviewed_days WHERE id=1;
 INSERT INTO public.document_retention_events(action,actor_auth_id,details) VALUES('policy_changed',p_actor,jsonb_build_object('enabled',p_enabled,'reviewed_days',p_reviewed_days));
END $$;
CREATE OR REPLACE FUNCTION public.manage_document_retention(p_actor uuid,p_bucket text,p_path text,p_action text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE user_id=p_actor AND role::text='admin') THEN RAISE EXCEPTION 'Staff admin required.'; END IF;
 IF p_bucket NOT IN ('identity-documents','ownership-documents','declaration-documents') OR nullif(trim(p_reason),'') IS NULL OR length(p_reason)>2000 OR p_action NOT IN ('hold','unhold','release','cancel_release','retry') THEN RAISE EXCEPTION 'Choose an evidence file, valid action and reason.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_path,82731));
 IF p_action='retry' THEN
  UPDATE public.document_retention_files SET attempts=0,lease_until=now()-interval '1 second'
   WHERE bucket_id=p_bucket AND path=p_path AND state='deleting' AND last_error IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a failed cleanup can be retried manually.'; END IF;
  INSERT INTO public.document_retention_events(bucket_id,path,action,actor_auth_id,details) VALUES(p_bucket,p_path,'cleanup_retry_requested',p_actor,jsonb_build_object('reason',trim(p_reason)));
  RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.document_retention_files WHERE bucket_id=p_bucket AND path=p_path AND state IN ('deleting','deleted')) THEN RAISE EXCEPTION 'Cleanup has already started or completed. This file cannot be changed.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id=p_bucket AND name=p_path) THEN RAISE EXCEPTION 'File not found.'; END IF;
 IF p_action='release' THEN
  IF brick_private.retention_current(p_path) THEN RAISE EXCEPTION 'Current/pending evidence cannot be released.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.document_retention_files WHERE bucket_id=p_bucket AND path=p_path AND legacy_protected) AND NOT brick_private.retention_reviewed(p_path) AND NOT (brick_private.retention_referenced(p_path) AND EXISTS(SELECT 1 FROM storage.objects o CROSS JOIN public.document_retention_policy p WHERE p.id=1 AND o.bucket_id=p_bucket AND o.name=p_path AND o.created_at<p.created_at)) THEN RAISE EXCEPTION 'Only reviewed or uncertain legacy history needs an expiry release. Use a hold to retain other files.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.document_retention_policy WHERE id=1 AND reviewed_days IS NOT NULL) THEN RAISE EXCEPTION 'Configure the reviewed-history retention period before releasing files.'; END IF;
 END IF;
 INSERT INTO public.document_retention_files(bucket_id,path) VALUES(p_bucket,p_path) ON CONFLICT DO NOTHING;
 UPDATE public.document_retention_files SET hold=CASE WHEN p_action='hold' THEN true WHEN p_action='unhold' THEN false ELSE hold END,
  hold_reason=CASE WHEN p_action IN ('hold','unhold') THEN trim(p_reason) ELSE hold_reason END,
  released_at=CASE WHEN p_action='release' THEN now() WHEN p_action='cancel_release' THEN NULL ELSE released_at END,
  release_reason=CASE WHEN p_action IN ('release','cancel_release') THEN trim(p_reason) ELSE release_reason END WHERE bucket_id=p_bucket AND path=p_path;
 INSERT INTO public.document_retention_events(bucket_id,path,action,actor_auth_id,details) VALUES(p_bucket,p_path,p_action,p_actor,jsonb_build_object('reason',trim(p_reason)));
END $$;
CREATE OR REPLACE FUNCTION public.document_expiry_status(p_bucket text,p_path text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR (brick_private.is_admin() OR
  (p_bucket IN ('identity-documents','ownership-documents') AND brick_private.document_access(p_bucket,p_path)) OR
  (p_bucket='declaration-documents' AND split_part(p_path,'/',1)=auth.uid()::text)) IS NOT TRUE THEN
  RAISE EXCEPTION 'Evidence access required.' USING ERRCODE='42501';
 END IF;
 RETURN (SELECT deleted_at FROM public.document_retention_files WHERE bucket_id=p_bucket AND path=p_path AND state='deleted');
END $$;
REVOKE ALL ON FUNCTION public.document_expiry_status(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.document_expiry_status(text,text) TO authenticated;
-- Capture uncertain pre-rollout evidence before future current-pointer changes
-- could erase its last reference. Never repeat this classification on later uploads.
DO $$ BEGIN
 IF NOT (SELECT backfill_complete FROM public.document_retention_policy WHERE id=1) THEN
  INSERT INTO public.document_retention_files(bucket_id,path,legacy_protected)
   SELECT o.bucket_id,o.name,true FROM storage.objects o CROSS JOIN public.document_retention_policy p
   WHERE p.id=1 AND o.bucket_id IN ('identity-documents','ownership-documents','declaration-documents')
    AND o.created_at<p.created_at AND brick_private.retention_referenced(o.name)
   ON CONFLICT(bucket_id,path) DO UPDATE SET legacy_protected=true;
  UPDATE public.document_retention_policy SET backfill_complete=true WHERE id=1;
 END IF;
END $$;
-- Service-only orchestration. Session users cannot claim/delete files or alter policy.
REVOKE ALL ON FUNCTION brick_private.retention_contains(jsonb,text),brick_private.retention_current(text),brick_private.retention_reviewed(text),brick_private.retention_reason(text,text),brick_private.retention_lock(text,text),brick_private.guard_retention_references(),brick_private.guard_retention_storage() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.inventory_document_retention(integer),public.preview_document_retention(integer),public.claim_document_retention(integer,uuid),public.finish_document_retention(text,text,uuid,text,text,boolean),public.configure_document_retention(uuid,boolean,integer),public.manage_document_retention(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_document_retention(integer),public.preview_document_retention(integer),public.claim_document_retention(integer,uuid),public.finish_document_retention(text,text,uuid,text,text,boolean),public.configure_document_retention(uuid,boolean,integer),public.manage_document_retention(uuid,text,text,text,text) TO service_role;

-- New reviews use available files; expired references remain in earlier audits.
CREATE OR REPLACE FUNCTION brick_private.property_review_snapshot(pid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('details',to_jsonb(p)-ARRAY['status','verification_status','ownership_verified','ownership_review_status',
 'ownership_reviewed_at','identity_reviewed_at','listing_reviewed_at','listing_source','rejection_reason','review_rejection_id',
 'review_resubmission_required','updated_at','approved_at','views_count','availability_status','available_from','availability_confirmed_at',
 'is_featured','featured_until','featured_rank','featured_plan_key','featured_started_at','featured_last_order_id'],
 'evidence',coalesce((SELECT jsonb_agg(d.document_url ORDER BY d.id) FROM public.documents d WHERE d.property_id=p.id AND d.user_id=p.seller_id AND d.document_type::text='ownership' AND brick_private.retention_available('ownership-documents',d.document_url)),'[]'::jsonb),
 'photos',coalesce((SELECT jsonb_agg(jsonb_build_array(i.id,i.image_url) ORDER BY i.id) FROM public.property_images i WHERE i.property_id=p.id),'[]'::jsonb),
 'videos',coalesce((SELECT jsonb_agg(jsonb_build_array(v.id,v.video_url) ORDER BY v.id) FROM public.property_videos v WHERE v.property_id=p.id),'[]'::jsonb))
 FROM public.properties p WHERE p.id=pid
$$;
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
 INSERT INTO public.ownership_reviews(property_id,document_id,document_path,reviewer_auth_id,decision,owner_kind,owner_legal_name,project_name,checks,note) VALUES(p.id,d.id,d.document_url,auth.uid(),CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,p.owner_kind,p.owner_legal_name,p.owner_project_name,coalesce(p_checks,'{}') || jsonb_build_object('identity_evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',i.id,'document_path',i.document_url,'document_type',i.document_type)) FROM public.documents i WHERE i.user_id=u.id AND i.property_id IS NULL AND i.status::text='approved' AND brick_private.retention_available('identity-documents',i.document_url) AND i.id=(SELECT id FROM public.documents latest_id WHERE latest_id.user_id=u.id AND latest_id.property_id IS NULL AND latest_id.document_type=i.document_type ORDER BY created_at DESC NULLS LAST,id DESC LIMIT 1)),'[]'::jsonb), 'supporting_property_evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',e.id,'document_path',e.document_url,'status',e.status)) FROM public.documents e WHERE e.property_id=p.id AND e.user_id=u.id AND e.document_type::text='ownership' AND brick_private.retention_available('ownership-documents',e.document_url)),'[]'::jsonb)),p_note);
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
   WHERE d.property_id=p.id AND d.user_id=u.id AND d.document_type::text='ownership' AND d.status::text IN ('pending','rejected','approved') AND brick_private.retention_available('ownership-documents',d.document_url)) THEN
   RAISE EXCEPTION 'Upload and save ownership evidence for this property before resubmitting.';
  END IF;
 END IF;
 verification:=CASE WHEN destination='ownership' THEN 'ownership_submitted' ELSE 'ownership_approved' END;
 UPDATE public.properties SET review_resubmission_required=false,status='pending',rejection_reason=NULL,listing_reviewed_at=NULL,
  ownership_review_status=CASE WHEN destination='ownership' THEN 'unreviewed' ELSE ownership_review_status END,
  verification_status=verification WHERE id=p.id;
 IF destination='ownership' AND NOT EXISTS(SELECT 1 FROM public.documents WHERE property_id=p.id AND user_id=u.id AND document_type::text='ownership' AND status::text='pending') THEN
  UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
   WHERE property_id=p.id AND user_id=u.id AND document_type::text='ownership' AND status::text IN ('rejected','approved') AND brick_private.retention_available('ownership-documents',document_url);
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
CREATE OR REPLACE FUNCTION brick_private.reopen_owner_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.ownership_review_status='unreviewed' AND OLD.ownership_review_status IN ('approved','rejected') THEN
  UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL
   WHERE property_id=NEW.id AND user_id=NEW.seller_id AND document_type::text='ownership'
    AND status::text=OLD.ownership_review_status AND brick_private.retention_available('ownership-documents',document_url);
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION brick_private.account_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status OR NEW.seller_status IS DISTINCT FROM OLD.seller_status OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity THEN
  INSERT INTO public.account_security_events(actor_auth_id,user_id,action,details) VALUES(auth.uid(),NEW.id,'account_permissions_changed',jsonb_build_object('old_role',OLD.role,'new_role',NEW.role,'old_kyc',OLD.kyc_status,'new_kyc',NEW.kyc_status,'seller_identity',NEW.seller_identity,'old_seller_identity',OLD.seller_identity,'old_seller_status',OLD.seller_status,'new_seller_status',NEW.seller_status));
  IF NEW.role::text='admin' AND OLD.role::text<>'admin' THEN UPDATE public.properties SET listing_source='brickinfinity_admin' WHERE seller_id=NEW.id; END IF;
  IF NEW.role::text<>'admin' AND (NEW.role::text<>'seller' OR NEW.kyc_status::text<>'approved' OR NEW.seller_status::text<>'active' OR NEW.seller_identity IS DISTINCT FROM OLD.seller_identity) THEN
   UPDATE public.properties SET status='pending', verification_status='ownership_submitted', ownership_verified=false,
    ownership_review_status='unreviewed',ownership_reviewed_at=NULL,identity_reviewed_at=NULL,listing_reviewed_at=NULL
   WHERE seller_id=NEW.id AND deleted_at IS NULL;
   UPDATE public.documents d SET status='pending',reviewed_at=NULL,reviewed_by=NULL FROM public.properties p WHERE d.property_id=p.id AND p.seller_id=NEW.id AND d.document_type::text='ownership' AND p.ownership_review_status='unreviewed' AND brick_private.retention_available('ownership-documents',d.document_url);
   IF NEW.kyc_status::text='pending' AND OLD.kyc_status::text='approved' THEN UPDATE public.documents SET status='pending',reviewed_at=NULL,reviewed_by=NULL WHERE user_id=NEW.id AND property_id IS NULL AND status::text='approved' AND brick_private.retention_available('identity-documents',document_url); END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION brick_private.guard_retention_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE review public.ownership_reviews%ROWTYPE;file text;
BEGIN
 IF NEW.ownership_verified AND NEW.ownership_review_status='approved' THEN
  SELECT * INTO review FROM public.ownership_reviews WHERE property_id=NEW.id AND decision='approved' AND created_at=NEW.ownership_reviewed_at ORDER BY id DESC LIMIT 1;
  IF FOUND THEN
   FOR file IN SELECT DISTINCT value #>> '{}' FROM jsonb_path_query(jsonb_build_array(review.document_path,review.checks),'$.** ? (@.type() == "string")') value
    WHERE (value #>> '{}') LIKE '%/%' ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(file,82731));
   END LOOP;
  END IF;
  IF review.id IS NULL OR NOT brick_private.retention_available('ownership-documents',review.document_path)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(review.checks->'identity_evidence','[]')) d WHERE NOT brick_private.retention_available('identity-documents',d->>'document_path'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(review.checks->'supporting_property_evidence','[]')) d WHERE NOT brick_private.retention_available('ownership-documents',d->>'document_path')) THEN
   NEW.ownership_verified:=false;NEW.ownership_review_status:='unreviewed';NEW.ownership_reviewed_at:=NULL;
   NEW.identity_reviewed_at:=NULL;NEW.listing_reviewed_at:=NULL;
   NEW.listing_source:=CASE WHEN EXISTS(SELECT 1 FROM public.users WHERE id=NEW.seller_id AND role::text='admin') THEN 'brickinfinity_admin' ELSE NULL END;
   NEW.status:='pending';NEW.verification_status:='ownership_submitted';
   IF NEW.review_resubmission_required THEN NEW.status:='rejected'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zzz_guard_retention_property ON public.properties;
CREATE TRIGGER zzz_guard_retention_property BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.guard_retention_property();
REVOKE ALL ON FUNCTION brick_private.retention_available(text,text),brick_private.guard_retention_property() FROM PUBLIC,anon,authenticated;
COMMIT;
