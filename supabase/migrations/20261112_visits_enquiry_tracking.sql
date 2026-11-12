-- Apply after 20261112_document_retention.sql. No external delivery provider required.
BEGIN;
CREATE TABLE public.property_enquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_key uuid NOT NULL,
 lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id), property_id uuid NOT NULL REFERENCES public.properties(id),
 buyer_id uuid NOT NULL REFERENCES public.users(id), seller_id uuid NOT NULL REFERENCES public.users(id),
 property_title text NOT NULL, buyer_name text NOT NULL, buyer_phone text NOT NULL, buyer_email text,
 crm_sync text NOT NULL DEFAULT 'pending' CHECK(crm_sync IN ('pending','completed','failed')),
 message text NOT NULL, status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','contacted','closed')),
 delivered_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, contacted_at timestamptz,
 visit_at timestamptz, visit_status text CHECK(visit_status IN ('requested','confirmed','declined','cancelled','completed')),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(buyer_id,request_key),
 CHECK((visit_at IS NULL)=(visit_status IS NULL))
);
CREATE INDEX property_enquiries_seller ON public.property_enquiries(seller_id,delivered_at DESC);
CREATE INDEX property_enquiries_buyer ON public.property_enquiries(buyer_id,delivered_at DESC);
CREATE TABLE public.enquiry_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enquiry_id uuid NOT NULL REFERENCES public.property_enquiries(id),
 actor_id uuid, action text NOT NULL, note text, visit_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enquiry_events_thread ON public.enquiry_events(enquiry_id,created_at);
ALTER TABLE public.property_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_enquiries,public.enquiry_events FROM anon,authenticated;
GRANT SELECT,UPDATE ON public.property_enquiries TO service_role;
-- All access is through participant-checked routines; no client-supplied seller or actor.
CREATE FUNCTION brick_private.validate_visit(at_time timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF at_time IS NULL OR at_time < now()+interval '1 hour' OR at_time > now()+interval '60 days'
 OR (at_time AT TIME ZONE 'Asia/Kolkata')::time < time '09:00'
 OR (at_time AT TIME ZONE 'Asia/Kolkata')::time > time '18:00'
 THEN RAISE EXCEPTION 'Choose a visit from 9 AM to 6 PM IST, at least one hour ahead and within 60 days.'; END IF;
END $$;
CREATE FUNCTION public.submit_property_enquiry(p_property_id uuid,p_request_key uuid,p_name text,p_phone text,p_email text,p_message text,p_visit_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;p public.properties%ROWTYPE;e public.property_enquiries%ROWTYPE;lid uuid;eid uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to send and track an enquiry.' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('enquiry-buyer:'||actor,0));
 SELECT * INTO e FROM public.property_enquiries WHERE buyer_id=actor AND request_key=p_request_key;
 IF FOUND THEN
  IF e.property_id IS DISTINCT FROM p_property_id OR e.buyer_name IS DISTINCT FROM trim(p_name) OR e.buyer_phone IS DISTINCT FROM p_phone
    OR e.buyer_email IS DISTINCT FROM nullif(lower(trim(p_email)),'') OR e.message IS DISTINCT FROM coalesce(trim(p_message),'')
    OR e.visit_at IS DISTINCT FROM p_visit_at THEN RAISE EXCEPTION 'This request was already used. Refresh before sending a different enquiry.'; END IF;
  RETURN jsonb_build_object('id',e.id,'lead_id',e.lead_id,'seller_id',e.seller_id,'duplicate',true);
 END IF;
 IF p_request_key IS NULL OR nullif(trim(p_name),'') IS NULL OR length(p_name)>100 OR p_phone IS NULL OR p_phone !~ '^[6-9][0-9]{9}$'
 OR length(coalesce(p_message,''))>2000 OR length(coalesce(p_email,''))>254
 OR (nullif(trim(p_email),'') IS NOT NULL AND p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Enter your name, a valid Indian mobile number and a message of up to 2,000 characters.'; END IF;
 SELECT * INTO p FROM public.properties WHERE id=p_property_id FOR SHARE;
 IF NOT FOUND OR NOT brick_private.public_listing(p.id) OR coalesce(p.availability_status,'unknown') IN ('rented','sold','unavailable') THEN RAISE EXCEPTION 'This property is not accepting enquiries.'; END IF;
 IF p.seller_id=actor THEN RAISE EXCEPTION 'You cannot enquire about your own property.'; END IF;
 IF (SELECT count(*) FROM public.property_enquiries WHERE buyer_id=actor AND delivered_at>now()-interval '24 hours')>=10 THEN RAISE EXCEPTION 'You have reached the daily limit of 10 enquiries. Please try again tomorrow.'; END IF;
 IF p_visit_at IS NOT NULL THEN
  PERFORM brick_private.validate_visit(p_visit_at);
  IF EXISTS(SELECT 1 FROM public.property_enquiries WHERE buyer_id=actor AND property_id=p.id AND visit_status IN ('requested','confirmed')) THEN RAISE EXCEPTION 'You already have an open visit request for this property. Manage it in My enquiries & visits.'; END IF;
 END IF;
 INSERT INTO public.leads(property_id,seller_id,buyer_name,buyer_phone,buyer_email,message,status,contacted)
 VALUES(p.id,p.seller_id,trim(p_name),p_phone,nullif(lower(trim(p_email)),''),coalesce(trim(p_message),''),'new',false) RETURNING id INTO lid;
 INSERT INTO public.property_enquiries(id,request_key,lead_id,property_id,buyer_id,seller_id,property_title,buyer_name,buyer_phone,buyer_email,message,visit_at,visit_status)
 VALUES(eid,p_request_key,lid,p.id,actor,p.seller_id,coalesce(p.title,'Property enquiry'),trim(p_name),p_phone,nullif(lower(trim(p_email)),''),coalesce(trim(p_message),''),p_visit_at,CASE WHEN p_visit_at IS NOT NULL THEN 'requested' END);
 INSERT INTO public.enquiry_events(enquiry_id,actor_id,action,visit_at) VALUES(eid,actor,'Delivered to seller inbox',p_visit_at);
 -- Notification and inbox record commit together, or neither commits.
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
 VALUES(p.seller_id,CASE WHEN p_visit_at IS NULL THEN 'New property enquiry' ELSE 'New visit request' END,
 trim(p_name)||' enquired about '||coalesce(p.title,'your property')||'.','lead','lead','/enquiries?view=seller','View enquiry','lead',lid);
 RETURN jsonb_build_object('id',eid,'lead_id',lid,'seller_id',p.seller_id,'property_title',p.title,'duplicate',false);
END $$;
CREATE FUNCTION public.list_property_enquiries(p_seller boolean DEFAULT false,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;result jsonb;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to view enquiries.' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.delivered_at DESC,t.id),'[]') INTO result FROM
 (SELECT e.*,(SELECT coalesce(jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at,ev.id),'[]') FROM public.enquiry_events ev WHERE ev.enquiry_id=e.id) AS events
 FROM public.property_enquiries e WHERE CASE WHEN p_seller THEN e.seller_id=actor ELSE e.buyer_id=actor END
 ORDER BY e.delivered_at DESC,e.id LIMIT 20 OFFSET greatest(0,least(coalesce(p_offset,0),10000))) t;
 RETURN jsonb_build_object('items',result,'total',(SELECT count(*) FROM public.property_enquiries e WHERE CASE WHEN p_seller THEN e.seller_id=actor ELSE e.buyer_id=actor END));
END $$;
CREATE FUNCTION public.update_property_enquiry(p_id uuid,p_action text,p_note text DEFAULT '',p_visit_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;e public.property_enquiries%ROWTYPE;recipient uuid;seller boolean;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL THEN RAISE EXCEPTION 'Sign in to manage enquiries.' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.property_enquiries WHERE id=p_id;
 IF NOT FOUND OR actor NOT IN (e.seller_id,e.buyer_id) THEN RAISE EXCEPTION 'Enquiry not found.' USING ERRCODE='42501'; END IF;
 -- Same seller lock serializes confirmations across different properties/threads.
 PERFORM pg_advisory_xact_lock(hashtextextended('enquiry-seller:'||e.seller_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('enquiry-buyer:'||e.buyer_id,0));
 SELECT * INTO e FROM public.property_enquiries WHERE id=p_id FOR UPDATE;
 seller:=actor=e.seller_id;recipient:=CASE WHEN seller THEN e.buyer_id ELSE e.seller_id END;
 IF (SELECT count(*) FROM public.enquiry_events WHERE actor_id=actor AND created_at>now()-interval '24 hours')>=100 THEN RAISE EXCEPTION 'Daily update limit reached. Please try again tomorrow.'; END IF;
 IF length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Keep the update under 1,000 characters.'; END IF;
 IF p_action IN ('read','contacted','closed') THEN
  IF NOT seller OR e.status='closed' OR (p_action='read' AND e.status<>'new') OR (p_action='contacted' AND e.status='contacted') THEN RAISE EXCEPTION 'This enquiry status cannot be changed that way.'; END IF;
  IF p_action='closed' AND e.visit_status IN ('requested','confirmed') THEN RAISE EXCEPTION 'Cancel or complete the open visit before closing this enquiry.'; END IF;
  UPDATE public.property_enquiries SET status=p_action,read_at=coalesce(read_at,now()),contacted_at=CASE WHEN p_action='contacted' THEN now() ELSE contacted_at END,updated_at=now() WHERE id=e.id;
  IF p_action='contacted' THEN UPDATE public.leads SET contacted=true,status='contacted' WHERE id=e.lead_id; END IF;
 ELSIF p_action IN ('confirmed','declined','completed','cancelled','reschedule') THEN
  IF e.visit_status IS NULL THEN RAISE EXCEPTION 'No visit is attached to this enquiry.'; END IF;
  IF p_action='reschedule' THEN
   IF seller OR e.status='closed' OR e.visit_status NOT IN ('requested','confirmed','declined','cancelled') THEN RAISE EXCEPTION 'Only the buyer can request a new visit time.'; END IF;
   PERFORM brick_private.validate_visit(p_visit_at);
   IF EXISTS(SELECT 1 FROM public.property_enquiries WHERE id<>e.id AND buyer_id=e.buyer_id AND property_id=e.property_id AND visit_status IN ('requested','confirmed')) THEN RAISE EXCEPTION 'Another open visit exists for this property.'; END IF;
   IF NOT brick_private.public_listing(e.property_id) OR EXISTS(SELECT 1 FROM public.properties WHERE id=e.property_id AND availability_status IN ('rented','sold','unavailable')) THEN RAISE EXCEPTION 'This property is no longer accepting visits.'; END IF;
   UPDATE public.property_enquiries SET visit_at=p_visit_at,visit_status='requested',updated_at=now() WHERE id=e.id;
  ELSE
   IF (p_action IN ('confirmed','declined') AND (NOT seller OR e.visit_status<>'requested'))
    OR (p_action='cancelled' AND e.visit_status NOT IN ('requested','confirmed'))
    OR (p_action='completed' AND (NOT seller OR e.visit_status<>'confirmed' OR e.visit_at>now())) THEN RAISE EXCEPTION 'This visit status cannot be changed that way.'; END IF;
   IF p_action IN ('declined','cancelled') AND nullif(trim(p_note),'') IS NULL THEN RAISE EXCEPTION 'Please explain the cancellation or declined visit.'; END IF;
   IF p_action='confirmed' THEN
    IF e.visit_at<=now() OR NOT brick_private.public_listing(e.property_id) OR EXISTS(SELECT 1 FROM public.properties WHERE id=e.property_id AND availability_status IN ('rented','sold','unavailable')) THEN RAISE EXCEPTION 'This visit time or property is no longer available.'; END IF;
    IF EXISTS(SELECT 1 FROM public.property_enquiries WHERE (seller_id=e.seller_id OR buyer_id=e.buyer_id) AND id<>e.id AND visit_status='confirmed' AND abs(extract(epoch FROM visit_at-e.visit_at))<3600) THEN RAISE EXCEPTION 'Another confirmed visit for the buyer or seller overlaps this one. Ask the buyer to request another time.'; END IF;
   END IF;
   UPDATE public.property_enquiries SET visit_status=p_action,updated_at=now() WHERE id=e.id;
  END IF;
 ELSE RAISE EXCEPTION 'Unknown enquiry action.'; END IF;
 INSERT INTO public.enquiry_events(enquiry_id,actor_id,action,note,visit_at) VALUES(e.id,actor,p_action,nullif(trim(p_note),''),CASE WHEN p_action='reschedule' THEN p_visit_at ELSE e.visit_at END);
 INSERT INTO public.notifications(user_id,title,message,type,category,link_url,action_label,entity_type,entity_id)
 VALUES(recipient,'Enquiry update',e.property_title||': '||replace(p_action,'reschedule','new visit time requested')||CASE WHEN nullif(trim(p_note),'') IS NULL THEN '' ELSE E'\n'||trim(p_note) END,
 'lead','lead',CASE WHEN seller THEN '/enquiries' ELSE '/enquiries?view=seller' END,'View update','lead',e.lead_id);
END $$;
-- The existing lead inbox uses the same participant-checked status transition.
CREATE FUNCTION public.mark_property_lead_contacted(p_lead_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor uuid:=(brick_private.actor()->>'id')::uuid;eid uuid;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead_id AND seller_id=actor) THEN RAISE EXCEPTION 'Lead not found.' USING ERRCODE='42501'; END IF;
 SELECT id INTO eid FROM public.property_enquiries WHERE lead_id=p_lead_id;
 IF eid IS NOT NULL THEN PERFORM public.update_property_enquiry(eid,'contacted','',NULL);
 ELSE UPDATE public.leads SET contacted=true,status='contacted' WHERE id=p_lead_id AND seller_id=actor;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.mark_property_lead_contacted(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_property_lead_contacted(uuid) TO authenticated;
REVOKE ALL ON FUNCTION brick_private.validate_visit(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_property_enquiry(uuid,uuid,text,text,text,text,timestamptz),public.list_property_enquiries(boolean,integer),public.update_property_enquiry(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_property_enquiry(uuid,uuid,text,text,text,text,timestamptz),public.list_property_enquiries(boolean,integer),public.update_property_enquiry(uuid,text,text,timestamptz) TO authenticated;
COMMIT;
