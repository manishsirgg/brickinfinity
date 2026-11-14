-- Requires visits/enquiry tracking and the full owner-only approval migrations.
BEGIN;
CREATE TABLE public.buyer_property_views (
 user_id uuid NOT NULL REFERENCES public.users(id), property_id uuid NOT NULL REFERENCES public.properties(id),
 title text NOT NULL, viewed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,property_id)
);
CREATE TABLE public.saved_searches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200), criteria jsonb NOT NULL, query jsonb NOT NULL,
 enabled boolean NOT NULL DEFAULT true, email_enabled boolean NOT NULL DEFAULT false, email_consent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saved_search_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), search_id uuid NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
 property_id uuid NOT NULL REFERENCES public.properties(id), matched_at timestamptz NOT NULL DEFAULT now(),
 email_state text NOT NULL CHECK(email_state IN ('none','pending','sending','accepted','failed','cancelled')),
 email_attempts integer NOT NULL DEFAULT 0, email_token uuid, email_lease timestamptz, email_first_attempt timestamptz,
 email_to text, email_from text, email_subject text, email_text text, email_provider_id text, email_error text, email_next_attempt timestamptz NOT NULL DEFAULT now(),
 UNIQUE(search_id,property_id)
);
CREATE TABLE public.saved_search_listing_events(property_id uuid PRIMARY KEY REFERENCES public.properties(id),changed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX buyer_views_expiry ON public.buyer_property_views(viewed_at);
CREATE INDEX buyer_views_recent ON public.buyer_property_views(user_id,viewed_at DESC);
CREATE INDEX saved_searches_owner ON public.saved_searches(user_id,created_at DESC);
-- Location/keyword criteria can exceed a btree row limit; keep the uniqueness key bounded.
CREATE UNIQUE INDEX saved_searches_owner_criteria ON public.saved_searches(user_id,md5(criteria::text));
CREATE INDEX saved_search_email_queue ON public.saved_search_matches(email_state,email_next_attempt);
ALTER TABLE public.buyer_property_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_search_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_search_listing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.buyer_property_views,public.saved_searches,public.saved_search_matches,public.saved_search_listing_events FROM anon,authenticated;
-- Only whitelisted public fields leave these routines, never seller contacts or review evidence.
CREATE FUNCTION brick_private.buyer_property(pid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug,'price',p.price,'listing_type',p.listing_type,'property_type',p.property_type,
  'built_up_area',p.built_up_area,'amenities',p.amenities,'furnishing_status',p.furnishing_status,'security_deposit',p.security_deposit,
  'availability_status',p.availability_status,'available_from',p.available_from,'availability_confirmed_at',p.availability_confirmed_at,
  'hourly_rate',p.hourly_rate,'daily_rate',p.daily_rate,'monthly_rate',p.monthly_rate,
  'listing_source',to_jsonb(p)->'listing_source','ownership_verified',to_jsonb(p)->'ownership_verified','ownership_review_status',to_jsonb(p)->'ownership_review_status','ownership_reviewed_at',to_jsonb(p)->'ownership_reviewed_at','identity_reviewed_at',to_jsonb(p)->'identity_reviewed_at','listing_reviewed_at',to_jsonb(p)->'listing_reviewed_at','views_count',to_jsonb(p)->'views_count','created_at',to_jsonb(p)->'created_at','is_featured',to_jsonb(p)->'is_featured','featured_until',to_jsonb(p)->'featured_until','featured_rank',to_jsonb(p)->'featured_rank','featured_plan_key',to_jsonb(p)->'featured_plan_key',
  'cities',(SELECT jsonb_build_object('name',c.name) FROM public.cities c WHERE c.id=p.city_id),
  'localities',(SELECT jsonb_build_object('name',l.name) FROM public.localities l WHERE l.id=p.locality_id),
  'property_images',coalesce((SELECT jsonb_agg(jsonb_build_object('image_url',i.image_url,'sort_order',i.sort_order) ORDER BY i.sort_order NULLS LAST,i.image_url) FROM public.property_images i WHERE i.property_id=p.id),'[]'))
 FROM public.properties p WHERE p.id=pid AND brick_private.public_listing(p.id) AND p.availability_status IN ('unknown','available','available_from')
$$;
CREATE FUNCTION public.record_buyer_property_view(p_property_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;title text;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to record recent properties.' USING ERRCODE='42501'; END IF;
 SELECT p.title INTO title FROM public.properties p WHERE p.id=p_property_id AND brick_private.public_listing(p.id) AND p.availability_status IN ('unknown','available','available_from');
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('buyer-history:'||actor,0));
 INSERT INTO public.buyer_property_views(user_id,property_id,title) VALUES(actor,p_property_id,coalesce(title,'Property'))
 ON CONFLICT(user_id,property_id) DO UPDATE SET title=excluded.title,viewed_at=now();
 DELETE FROM public.buyer_property_views WHERE user_id=actor AND (viewed_at<now()-interval '90 days' OR property_id IN
  (SELECT property_id FROM public.buyer_property_views WHERE user_id=actor ORDER BY viewed_at DESC,property_id OFFSET 100));
END $$;
CREATE FUNCTION public.toggle_buyer_favorite(p_property_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR brick_private.actor() IS NULL THEN RAISE EXCEPTION 'Sign in to save properties.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('favorite:'||auth.uid()||p_property_id,0));
 IF EXISTS(SELECT 1 FROM public.favorites WHERE user_id=auth.uid() AND property_id=p_property_id) THEN
  DELETE FROM public.favorites WHERE user_id=auth.uid() AND property_id=p_property_id; RETURN false;
 END IF;
 IF brick_private.buyer_property(p_property_id) IS NULL THEN RAISE EXCEPTION 'This property is no longer available to save.'; END IF;
 INSERT INTO public.favorites(user_id,property_id) VALUES(auth.uid(),p_property_id); RETURN true;
END $$;
CREATE FUNCTION public.remove_buyer_favorite(p_property_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('favorite:'||auth.uid()||p_property_id,0));
 DELETE FROM public.favorites WHERE user_id=auth.uid() AND property_id=p_property_id;
END $$;
CREATE FUNCTION public.get_buyer_activity(p_category text DEFAULT 'viewed',p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;result jsonb;total integer;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to view buyer activity.' USING ERRCODE='42501'; END IF;
 IF p_category NOT IN ('saved','viewed','contacted','visits') OR p_category IS NULL THEN RAISE EXCEPTION 'Choose a valid activity category.'; END IF;
 WITH source AS (
  SELECT f.property_id,'Saved property'::text AS title,(to_jsonb(f)->>'created_at')::timestamptz AS happened_at,NULL::text AS visit_status FROM public.favorites f WHERE p_category='saved' AND f.user_id=auth.uid()
  UNION ALL SELECT v.property_id,v.title,v.viewed_at,NULL FROM public.buyer_property_views v WHERE p_category='viewed' AND v.user_id=actor AND v.viewed_at>now()-interval '90 days'
  UNION ALL SELECT e.property_id,e.property_title,e.delivered_at,e.visit_status FROM public.property_enquiries e WHERE e.buyer_id=actor AND (p_category='contacted' OR (p_category='visits' AND e.visit_status IS NOT NULL))
 ), latest AS (SELECT DISTINCT ON(property_id) * FROM source ORDER BY property_id,happened_at DESC NULLS LAST)
 SELECT count(*) INTO total FROM latest;
 WITH source AS (
  SELECT f.property_id,'Saved property'::text AS title,(to_jsonb(f)->>'created_at')::timestamptz AS happened_at,NULL::text AS visit_status FROM public.favorites f WHERE p_category='saved' AND f.user_id=auth.uid()
  UNION ALL SELECT v.property_id,v.title,v.viewed_at,NULL FROM public.buyer_property_views v WHERE p_category='viewed' AND v.user_id=actor AND v.viewed_at>now()-interval '90 days'
  UNION ALL SELECT e.property_id,e.property_title,e.delivered_at,e.visit_status FROM public.property_enquiries e WHERE e.buyer_id=actor AND (p_category='contacted' OR (p_category='visits' AND e.visit_status IS NOT NULL))
 ), latest AS (SELECT DISTINCT ON(property_id) * FROM source ORDER BY property_id,happened_at DESC NULLS LAST)
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.happened_at DESC NULLS LAST,t.property_id),'[]') INTO result FROM
 (SELECT l.*,brick_private.buyer_property(l.property_id) AS property FROM latest l ORDER BY happened_at DESC NULLS LAST,property_id LIMIT 12 OFFSET greatest(0,least(coalesce(p_offset,0),10000))) t;
 RETURN jsonb_build_object('items',result,'total',total);
END $$;
CREATE FUNCTION public.clear_buyer_views() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in.' USING ERRCODE='42501'; END IF;
 DELETE FROM public.buyer_property_views WHERE user_id::text=brick_private.actor()->>'id';
END $$;
CREATE FUNCTION public.get_comparison_properties(p_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_ids IS NULL OR cardinality(p_ids)>3 OR cardinality(p_ids)<1 OR array_position(p_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Compare one to three properties.'; END IF;
 SELECT coalesce(jsonb_agg(t.property ORDER BY t.position),'[]') INTO result FROM
 (SELECT id,min(position) AS position,brick_private.buyer_property(id) AS property FROM unnest(p_ids) WITH ORDINALITY x(id,position) GROUP BY id) t WHERE t.property IS NOT NULL;
 RETURN result;
END $$;
CREATE FUNCTION brick_private.validate_buyer_search(c jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;v jsonb;n numeric;
BEGIN
 IF c IS NULL OR jsonb_typeof(c)<>'object' OR c='{}' OR pg_column_size(c)>30000 THEN RAISE EXCEPTION 'Choose valid search filters.'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(c) LOOP
  IF k NOT IN ('listing_type','property_type','furnishing','availability','confirmed_recent','state_id','city_id','locality_id','min_price','max_price','min_area','max_area','bedrooms','bathrooms','amenities','terms','keyword_city_ids','keyword_locality_ids') THEN RAISE EXCEPTION 'Unsupported search filter.'; END IF;
  IF k IN ('min_price','max_price','min_area','max_area','bedrooms','bathrooms') THEN
   IF jsonb_typeof(v)<>'number' THEN RAISE EXCEPTION 'Invalid numeric filter.'; END IF;
   n:=(v#>>'{}')::numeric;
   IF n<0 OR n>1000000000000 OR (k IN ('bedrooms','bathrooms') AND (n<1 OR n>5 OR trunc(n)<>n)) THEN RAISE EXCEPTION 'Invalid numeric filter.'; END IF;
  ELSIF k IN ('amenities','terms','keyword_city_ids','keyword_locality_ids') THEN
   IF jsonb_typeof(v)<>'array' THEN RAISE EXCEPTION 'Invalid search list.'; END IF;
   IF jsonb_array_length(v)>300 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>100) THEN RAISE EXCEPTION 'Search list is too long.'; END IF;
   IF k IN ('keyword_city_ids','keyword_locality_ids') THEN PERFORM (x#>>'{}')::uuid FROM jsonb_array_elements(v) x; END IF;
  ELSE
   IF jsonb_typeof(v)<>'string' OR length(v#>>'{}')>100 THEN RAISE EXCEPTION 'Invalid search value.'; END IF;
   IF k IN ('state_id','city_id','locality_id') THEN PERFORM (v#>>'{}')::uuid; END IF;
   IF (k='listing_type' AND v#>>'{}' NOT IN ('Rent','Sale')) OR (k='availability' AND v#>>'{}' NOT IN ('available','available_from')) OR (k='confirmed_recent' AND v#>>'{}'<>'1') THEN RAISE EXCEPTION 'Invalid search value.'; END IF;
  END IF;
 END LOOP;
 IF (c->>'min_price')::numeric>(c->>'max_price')::numeric OR (c->>'min_area')::numeric>(c->>'max_area')::numeric THEN RAISE EXCEPTION 'Minimum cannot exceed maximum.'; END IF;
END $$;
CREATE FUNCTION public.save_buyer_search(p_name text,p_criteria jsonb,p_query jsonb,p_email boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;sid uuid;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to save searches.' USING ERRCODE='42501'; END IF;
 IF nullif(trim(p_name),'') IS NULL OR length(p_name)>200 OR p_email IS NULL OR p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR pg_column_size(p_query)>6000 THEN RAISE EXCEPTION 'Invalid search name or filters.'; END IF;
 PERFORM brick_private.validate_buyer_search(p_criteria);
 PERFORM pg_advisory_xact_lock(hashtextextended('saved-search:'||actor,0));
 SELECT id INTO sid FROM public.saved_searches WHERE user_id=actor AND criteria=p_criteria;
 IF sid IS NOT NULL THEN RETURN sid; END IF;
 IF (SELECT count(*) FROM public.saved_searches WHERE user_id=actor)>=20 THEN RAISE EXCEPTION 'You can save up to 20 searches. Remove an old search first.'; END IF;
 INSERT INTO public.saved_searches(user_id,name,criteria,query,email_enabled,email_consent_at) VALUES(actor,trim(p_name),p_criteria,p_query,p_email,CASE WHEN p_email THEN now() END) RETURNING id INTO sid;
 RETURN sid;
END $$;
ALTER TABLE public.saved_searches ADD COLUMN starts_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION public.manage_buyer_search(p_id uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.saved_searches%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in.' USING ERRCODE='42501'; END IF;
 -- Keep preference/deletion locks in the same order as email claims.
 PERFORM pg_advisory_xact_lock(hashtextextended('search-alert-email-claims',0));
 SELECT * INTO s FROM public.saved_searches WHERE id=p_id AND user_id::text=brick_private.actor()->>'id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Saved search not found.' USING ERRCODE='42501'; END IF;
 IF p_action='delete' THEN DELETE FROM public.saved_searches WHERE id=s.id; RETURN;
 ELSIF p_action='pause' THEN UPDATE public.saved_searches SET enabled=false,updated_at=now() WHERE id=s.id;
 ELSIF p_action='resume' THEN UPDATE public.saved_searches SET enabled=true,starts_at=CASE WHEN enabled THEN starts_at ELSE now() END,updated_at=now() WHERE id=s.id;
 ELSIF p_action='email_on' THEN UPDATE public.saved_searches SET email_enabled=true,email_consent_at=now(),updated_at=now() WHERE id=s.id;
 ELSIF p_action='email_off' THEN UPDATE public.saved_searches SET email_enabled=false,email_consent_at=NULL,updated_at=now() WHERE id=s.id;
 ELSE RAISE EXCEPTION 'Unknown saved search action.'; END IF;
 IF p_action IN ('pause','email_off') THEN UPDATE public.saved_search_matches SET email_state='cancelled',email_error='Alerts paused or email consent withdrawn.' WHERE search_id=s.id AND email_state='pending'; END IF;
END $$;
CREATE FUNCTION brick_private.matches_buyer_search(pid uuid,c jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.properties p LEFT JOIN public.cities city ON city.id=p.city_id
 WHERE p.id=pid AND brick_private.public_listing(p.id) AND p.availability_status IN ('unknown','available','available_from')
 AND (NOT c?'listing_type' OR p.listing_type::text=c->>'listing_type') AND (NOT c?'property_type' OR p.property_type::text=c->>'property_type')
 AND (NOT c?'state_id' OR city.state_id=(c->>'state_id')::uuid) AND (NOT c?'city_id' OR p.city_id=(c->>'city_id')::uuid) AND (NOT c?'locality_id' OR p.locality_id=(c->>'locality_id')::uuid)
 AND (NOT c?'min_price' OR p.price>=(c->>'min_price')::numeric) AND (NOT c?'max_price' OR p.price<=(c->>'max_price')::numeric)
 AND (NOT c?'min_area' OR p.built_up_area>=(c->>'min_area')::numeric) AND (NOT c?'max_area' OR p.built_up_area<=(c->>'max_area')::numeric)
 AND (NOT c?'bedrooms' OR p.bedrooms=(c->>'bedrooms')::integer) AND (NOT c?'bathrooms' OR p.bathrooms=(c->>'bathrooms')::integer)
 AND (NOT c?'furnishing' OR p.furnishing_status::text=c->>'furnishing') AND (NOT c?'amenities' OR to_jsonb(p.amenities) @> (c->'amenities'))
 AND (NOT c?'availability' OR p.availability_status=c->>'availability')
 AND (NOT c?'confirmed_recent' OR p.availability_confirmed_at>=now()-interval '30 days')
 AND (NOT c?'terms' OR jsonb_array_length(c->'terms')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'terms') term WHERE
  position(lower(term) IN lower(coalesce(p.title,'')))>0 OR position(lower(term) IN lower(coalesce(p.description,'')))>0 OR position(lower(term) IN lower(coalesce(p.slug,'')))>0
  OR position(lower(term) IN lower(coalesce(p.property_type::text,'')))>0 OR position(lower(term) IN lower(coalesce(p.listing_type::text,'')))>0)
  OR coalesce(c->'keyword_city_ids','[]') ? p.city_id::text OR coalesce(c->'keyword_locality_ids','[]') ? p.locality_id::text))
$$;
CREATE FUNCTION brick_private.queue_buyer_listing_event() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 -- No event for view counters, featured ranking or unrelated routine writes.
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['views_count','updated_at','is_featured','featured_until','featured_rank','featured_plan_key'])
  IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['views_count','updated_at','is_featured','featured_until','featured_rank','featured_plan_key']) THEN RETURN NEW; END IF;
 INSERT INTO public.saved_search_listing_events(property_id) VALUES(NEW.id) ON CONFLICT(property_id) DO UPDATE SET changed_at=now();
 RETURN NEW;
END $$;
CREATE TRIGGER queue_buyer_listing_event AFTER INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION brick_private.queue_buyer_listing_event();
CREATE FUNCTION public.process_saved_search_events(p_limit integer DEFAULT 25) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ev record;s record;mid uuid;n integer:=0;processed integer:=0;
BEGIN
 DELETE FROM public.buyer_property_views WHERE viewed_at<now()-interval '90 days';
 FOR ev IN SELECT * FROM public.saved_search_listing_events ORDER BY changed_at,property_id LIMIT greatest(1,least(coalesce(p_limit,25),100)) FOR UPDATE SKIP LOCKED LOOP
  IF brick_private.buyer_property(ev.property_id) IS NOT NULL THEN
   FOR s IN SELECT search.*,p.title,p.seller_id FROM public.saved_searches search JOIN public.properties p ON p.id=ev.property_id
    WHERE search.enabled AND search.starts_at<=ev.changed_at AND search.user_id<>p.seller_id AND brick_private.matches_buyer_search(p.id,search.criteria) FOR SHARE OF search LOOP
    mid:=NULL;
    INSERT INTO public.saved_search_matches(search_id,property_id,email_state) VALUES(s.id,ev.property_id,CASE WHEN s.email_enabled AND s.email_consent_at IS NOT NULL THEN 'pending' ELSE 'none' END)
     ON CONFLICT(search_id,property_id) DO NOTHING RETURNING id INTO mid;
    IF mid IS NOT NULL THEN
     INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
      VALUES(s.user_id,'New property matching your search',s.name||': '||coalesce(s.title,'Property'),'property','property','/buyer?tab=searches','View matching properties','property',ev.property_id);
     n:=n+1;
    END IF;
   END LOOP;
  END IF;
  DELETE FROM public.saved_search_listing_events WHERE property_id=ev.property_id;
  processed:=processed+1;
 END LOOP;
 RETURN jsonb_build_object('matches',n,'processed',processed);
END $$;
CREATE FUNCTION public.get_buyer_searches() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to view searches.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('searches',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC),'[]') FROM public.saved_searches s WHERE s.user_id=actor),
 'matches',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.matched_at DESC),'[]') FROM
  (SELECT m.id,m.search_id,s.name,m.matched_at,m.email_state,brick_private.buyer_property(m.property_id) AS property FROM public.saved_search_matches m JOIN public.saved_searches s ON s.id=m.search_id WHERE s.user_id=actor ORDER BY m.matched_at DESC,m.id LIMIT 30) t));
END $$;
CREATE FUNCTION public.claim_search_alert_email(p_from text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.saved_search_matches%ROWTYPE;s public.saved_searches%ROWTYPE;recipient text;verified timestamptz;p public.properties%ROWTYPE;token uuid:=gen_random_uuid();
BEGIN
 IF nullif(trim(p_from),'') IS NULL OR length(p_from)>320 OR p_from ~ E'[\n\r]' THEN RAISE EXCEPTION 'Configure a verified email sender.'; END IF;
 -- Daily limit and lease claims are serialized across concurrent workers.
 PERFORM pg_advisory_xact_lock(hashtextextended('search-alert-email-claims',0));
 UPDATE public.saved_search_matches SET email_state='failed',email_error='Alert expired before email delivery.' WHERE email_state IN ('pending','sending') AND matched_at<now()-interval '7 days' AND (email_state='pending' OR email_lease<now());
 FOR m IN SELECT * FROM public.saved_search_matches WHERE (email_state='pending' OR (email_state='sending' AND email_lease<now())) AND email_next_attempt<=now()
 AND EXISTS(SELECT 1 FROM public.saved_searches es JOIN public.users eu ON eu.id=es.user_id JOIN auth.users au ON au.id=eu.user_id WHERE es.id=search_id AND au.email IS NOT NULL AND au.email_confirmed_at IS NOT NULL)
 ORDER BY matched_at,id LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  SELECT * INTO s FROM public.saved_searches WHERE id=m.search_id FOR SHARE;
  IF NOT FOUND OR NOT s.enabled OR NOT s.email_enabled OR s.email_consent_at IS NULL OR NOT brick_private.matches_buyer_search(m.property_id,s.criteria) THEN
   UPDATE public.saved_search_matches SET email_state='cancelled',email_error='Search paused, consent withdrawn or listing no longer matches.' WHERE id=m.id; CONTINUE;
  END IF;
  IF m.email_attempts>=3 OR m.email_first_attempt<now()-interval '23 hours' OR m.matched_at<now()-interval '7 days' THEN
   UPDATE public.saved_search_matches SET email_state='failed',email_error='Retry window expired; delivery is unconfirmed.' WHERE id=m.id; CONTINUE;
  END IF;
  SELECT au.email,au.email_confirmed_at INTO recipient,verified FROM public.users u JOIN auth.users au ON au.id=u.user_id WHERE u.id=s.user_id;
  IF recipient IS NULL OR verified IS NULL THEN CONTINUE; END IF;
  IF m.email_to IS NOT NULL AND m.email_to IS DISTINCT FROM recipient THEN
   UPDATE public.saved_search_matches SET email_state='cancelled',email_error='Verified email address changed.' WHERE id=m.id; CONTINUE;
  END IF;
  IF (SELECT count(*) FROM public.saved_search_matches other JOIN public.saved_searches os ON os.id=other.search_id WHERE os.user_id=s.user_id AND other.email_first_attempt>now()-interval '24 hours')>=10 AND m.email_first_attempt IS NULL THEN UPDATE public.saved_search_matches SET email_next_attempt=now()+interval '1 day' WHERE id=m.id; CONTINUE; END IF;
  SELECT * INTO p FROM public.properties WHERE id=m.property_id;
  UPDATE public.saved_search_matches SET email_state='sending',email_token=token,email_lease=now()+interval '10 minutes',email_attempts=email_attempts+1,
   email_first_attempt=coalesce(email_first_attempt,now()),email_to=coalesce(email_to,recipient),email_from=coalesce(email_from,p_from),
   email_subject=coalesce(email_subject,'A new property matches your BrickInfinity search'),
   email_text=coalesce(email_text,'Your saved search: '||s.name||E'\n\n'||coalesce(p.title,'Property')||E'\nhttps://www.brickinfinity.com/property/'||p.id||'/'||coalesce(p.slug,'property')||E'\n\nCheck the listing for current price and availability.\nManage or stop these alerts: https://www.brickinfinity.com/buyer?tab=searches\nYou received this because you opted into email alerts for this saved search.')
   WHERE id=m.id RETURNING * INTO m;
  RETURN jsonb_build_object('id',m.id,'token',token,'to',m.email_to,'from',m.email_from,'subject',m.email_subject,'text',m.email_text);
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION public.finish_search_alert_email(p_id uuid,p_token uuid,p_outcome text,p_provider_id text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','retry','failed') OR (p_outcome='accepted' AND nullif(trim(p_provider_id),'') IS NULL) THEN RAISE EXCEPTION 'Invalid email result.'; END IF;
 UPDATE public.saved_search_matches SET email_state=CASE WHEN p_outcome='retry' AND email_attempts<3 THEN 'pending' WHEN p_outcome='accepted' THEN 'accepted' ELSE 'failed' END,
 email_provider_id=CASE WHEN p_outcome='accepted' THEN left(p_provider_id,200) ELSE NULL END,email_error=CASE WHEN p_outcome='accepted' THEN NULL WHEN p_outcome='retry' THEN 'Provider temporarily unavailable; retry pending.' ELSE 'Provider rejected the email.' END,
 email_next_attempt=now()+interval '15 minutes',email_lease=NULL WHERE id=p_id AND email_token=p_token AND email_state='sending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale email claim.'; END IF;
END $$;
CREATE FUNCTION public.search_alert_operations() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('listing_events',(SELECT count(*) FROM public.saved_search_listing_events),
 'pending_emails',(SELECT count(*) FROM public.saved_search_matches WHERE email_state IN ('pending','sending')),
 'accepted_emails',(SELECT count(*) FROM public.saved_search_matches WHERE email_state='accepted'),
 'failed_emails',(SELECT count(*) FROM public.saved_search_matches WHERE email_state='failed'))
$$;
REVOKE ALL ON FUNCTION brick_private.buyer_property(uuid),brick_private.validate_buyer_search(jsonb),brick_private.matches_buyer_search(uuid,jsonb),brick_private.queue_buyer_listing_event() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_buyer_property_view(uuid),public.toggle_buyer_favorite(uuid),public.remove_buyer_favorite(uuid),public.get_buyer_activity(text,integer),public.clear_buyer_views(),public.save_buyer_search(text,jsonb,jsonb,boolean),public.manage_buyer_search(uuid,text),public.get_buyer_searches() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_buyer_property_view(uuid),public.toggle_buyer_favorite(uuid),public.remove_buyer_favorite(uuid),public.get_buyer_activity(text,integer),public.clear_buyer_views(),public.save_buyer_search(text,jsonb,jsonb,boolean),public.manage_buyer_search(uuid,text),public.get_buyer_searches() TO authenticated;
REVOKE ALL ON FUNCTION public.get_comparison_properties(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comparison_properties(uuid[]) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.process_saved_search_events(integer),public.claim_search_alert_email(text),public.finish_search_alert_email(uuid,uuid,text,text),public.search_alert_operations() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_saved_search_events(integer),public.claim_search_alert_email(text),public.finish_search_alert_email(uuid,uuid,text,text),public.search_alert_operations() TO service_role;
COMMIT;
