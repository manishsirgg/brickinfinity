process.on('uncaughtException',error=>{ console.error(error.message, error.where || '', error.stack?.split('\n').slice(1,4).join('\n') || ''); process.exit(1); });
import { PGlite } from '@electric-sql/pglite';
import {randomUUID} from 'node:crypto';import fs from 'node:fs';import assert from 'node:assert/strict';
const db=new PGlite();const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [buyer,seller,other,property,privateProperty,city,state,locality]=Array.from({length:8},(_,i)=>uuid(i+1));
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE SCHEMA brick_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
 CREATE TABLE public.users(id uuid PRIMARY KEY,user_id uuid,role text);
 CREATE FUNCTION brick_private.actor() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT to_jsonb(u) FROM public.users u WHERE u.user_id=auth.uid() $$;
 GRANT USAGE ON SCHEMA auth,brick_private TO anon,authenticated;GRANT EXECUTE ON FUNCTION auth.uid(),brick_private.actor() TO authenticated,anon;
 CREATE TABLE cities(id uuid PRIMARY KEY,name text,state_id uuid);CREATE TABLE localities(id uuid PRIMARY KEY,name text);
 CREATE TABLE properties(id uuid PRIMARY KEY,seller_id uuid,title text,description text,slug text,status text,verification_status text,deleted_at timestamptz,
 price numeric,built_up_area numeric,listing_type text,property_type text,city_id uuid,locality_id uuid,bedrooms integer,bathrooms integer,amenities text[],furnishing_status text,security_deposit numeric,
 availability_status text,available_from date,availability_confirmed_at timestamptz,hourly_rate numeric,daily_rate numeric,monthly_rate numeric,views_count integer,updated_at timestamptz);
 CREATE FUNCTION brick_private.public_listing(pid uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM properties WHERE id=pid AND status='active' AND verification_status='approved' AND deleted_at IS NULL) $$;
 CREATE TABLE property_images(property_id uuid,image_url text,sort_order integer);
 CREATE TABLE favorites(id uuid DEFAULT gen_random_uuid(),user_id uuid,property_id uuid);
 CREATE TABLE property_enquiries(property_id uuid,buyer_id uuid,property_title text,delivered_at timestamptz,visit_status text);
 CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,title text,message text,type text,category text,link_url text,action_label text,entity_type text,entity_id uuid);
`);
await db.query("INSERT INTO public.users VALUES($1,$1,'buyer'),($2,$2,'seller'),($3,$3,'buyer')",[buyer,seller,other]);
await db.query("INSERT INTO auth.users VALUES($1,'verified@example.com',now()),($2,'unverified@example.com',NULL)",[buyer,other]);
await db.query("INSERT INTO cities VALUES($1,'Chhatarpur',$2);",[city,state]);await db.query("INSERT INTO localities VALUES($1,'G3 Market')",[locality]);
await db.query("INSERT INTO properties(id,seller_id,title,description,slug,status,verification_status,price,built_up_area,listing_type,property_type,city_id,locality_id,bedrooms,bathrooms,amenities,furnishing_status,security_deposit,availability_status,availability_confirmed_at,monthly_rate) VALUES($1,$2,'Commercial office','Office space','office','pending','approved',20000,1200,'Rent','Commercial',$3,$4,2,1,ARRAY['Lift','Gym'],'Unfurnished',0,'available',now(),20000),($5,$2,'Private listing','Secret','private','pending','approved',10000,2000,'Rent','Commercial',$3,$4,2,1,ARRAY['Lift'],'Unfurnished',NULL,'available',now(),10000)",[property,seller,city,locality,privateProperty]);
await db.exec(fs.readFileSync('supabase/migrations/20261114_buyer_discovery.sql','utf8'));
async function as(id,role='authenticated'){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`SET ROLE ${role}`);}
const rpc=async(name,args=[],placeholders=args.map((_,i)=>'$'+(i+1)).join(','))=>{const r=(await db.query(`SELECT ${name}(${placeholders}) AS r`,args)).rows[0].r;return name==='process_saved_search_events'?r.matches:r;};
const criteria={listing_type:'Rent',property_type:'Commercial',city_id:city,max_price:25000,min_area:1000,amenities:['Lift']};
await as(null,'anon');await assert.rejects(rpc('get_buyer_activity'),/permission denied/);assert.deepEqual(await rpc('get_comparison_properties',[[privateProperty]]),[]);
await as(buyer);const sid=await rpc('save_buyer_search',['My commercial search',criteria,{listing_type:'Rent'},true]);assert.equal(await rpc('save_buyer_search',['Duplicate',criteria,{},false]),sid);
await assert.rejects(rpc('save_buyer_search',['Invalid',{min_price:-1},{},false]),/Invalid numeric/);
await assert.rejects(rpc('save_buyer_search',['Range',{min_area:2000,max_area:1000},{},false]),/Minimum/);
await assert.rejects(rpc('process_saved_search_events'),/permission denied/);await assert.rejects(db.query('SELECT * FROM saved_search_matches'),/permission denied/);
await as(other);assert.equal((await rpc('get_buyer_searches')).searches.length,0);await assert.rejects(rpc('manage_buyer_search',[sid,'pause']),/not found/);
await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),0);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET status='active' WHERE id=$1",[property]);
await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),1);assert.equal(await rpc('process_saved_search_events'),0);
await as(buyer);let searches=await rpc('get_buyer_searches');assert.equal(searches.matches.length,1);assert.equal(searches.matches[0].property.title,'Commercial office');
await rpc('record_buyer_property_view',[property]);await rpc('record_buyer_property_view',[property]);await rpc('record_buyer_property_view',[privateProperty]);
assert.equal((await rpc('get_buyer_activity',['viewed',0])).total,1);assert.equal(await rpc('toggle_buyer_favorite',[property]),true);assert.equal((await rpc('get_buyer_activity',['saved',0])).total,1);
await db.exec('RESET ROLE');await db.query("INSERT INTO property_enquiries VALUES($1,$2,'Old title',now()-interval '1 hour',NULL),($1,$2,'Commercial office',now(),'requested')",[property,buyer]);
await as(buyer);assert.equal((await rpc('get_buyer_activity',['contacted',0])).total,1);assert.equal((await rpc('get_buyer_activity',['visits',0])).items[0].visit_status,'requested');
await as(other);assert.equal((await rpc('get_buyer_activity',['viewed',0])).total,0);assert.equal((await rpc('get_buyer_activity',['contacted',0])).total,0);
await as(null,'anon');assert.equal((await rpc('get_comparison_properties',[[property,privateProperty,property]])).length,1);await assert.rejects(rpc('get_comparison_properties',[[property,privateProperty,property,privateProperty]]),/one to three/);
// Verified-account recipient, frozen provider payload, leases, stale token and retry semantics.
await as(null,'service_role');let claim=await rpc('claim_search_alert_email',['BrickInfinity <alerts@brickinfinity.com>']);assert.equal(claim.to,'verified@example.com');assert.equal(claim.from,'BrickInfinity <alerts@brickinfinity.com>');
assert.equal(await rpc('claim_search_alert_email',['other@brickinfinity.com']),null);await assert.rejects(rpc('finish_search_alert_email',[claim.id,uuid(100),'accepted','provider-id']),/Stale/);
await rpc('finish_search_alert_email',[claim.id,claim.token,'retry',null]);await db.exec('RESET ROLE');await db.query("UPDATE saved_search_matches SET email_next_attempt=now()-interval '1 minute' WHERE id=$1",[claim.id]);
await as(null,'service_role');let retry=await rpc('claim_search_alert_email',['Changed <new@brickinfinity.com>']);assert.equal(retry.from,claim.from);assert.equal(retry.text,claim.text);assert.equal(retry.id,claim.id);assert.notEqual(retry.token,claim.token);
await rpc('finish_search_alert_email',[retry.id,retry.token,'accepted','resend-1']);
await as(buyer);assert.equal((await rpc('get_buyer_searches')).matches[0].email_state,'accepted');
// Mutations while published can newly match, but re-publication and view counts never duplicate alerts.
await db.exec('RESET ROLE');await db.query("UPDATE properties SET price=21000 WHERE id=$1",[property]);await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),0);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET views_count=5 WHERE id=$1",[property]);assert.equal((await db.query('SELECT count(*)::int n FROM saved_search_listing_events')).rows[0].n,0);
// Pause/resume does not generate backlog alerts; opted-out users get no queued email.
await as(buyer);await rpc('manage_buyer_search',[sid,'email_off']);await rpc('manage_buyer_search',[sid,'pause']);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET status='active' WHERE id=$1",[privateProperty]);await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),0);
await as(buyer);await rpc('manage_buyer_search',[sid,'resume']);await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),0);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET price=11000 WHERE id=$1",[privateProperty]);await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),1);assert.equal(await rpc('claim_search_alert_email',['alerts@brickinfinity.com']),null);
// A withdrawn/hidden listing stays in activity as an unavailable placeholder, never as a public card.
await db.exec('RESET ROLE');await db.query("UPDATE properties SET status='pending',title='Private revised title' WHERE id=$1",[property]);
await as(buyer);assert.equal((await rpc('get_buyer_activity',['viewed',0])).items[0].property,null);assert.equal((await rpc('get_buyer_activity',['viewed',0])).items[0].title,'Commercial office');
assert.equal(await rpc('toggle_buyer_favorite',[property]),false);await assert.rejects(rpc('toggle_buyer_favorite',[property]),/no longer available/);await rpc('clear_buyer_views');assert.equal((await rpc('get_buyer_activity',['viewed',0])).total,0);
await as(null,'anon');assert.deepEqual(await rpc('get_comparison_properties',[[property]]),[]);
// Match notification failure rolls back the receipt so the next worker can retry safely.
await db.exec('RESET ROLE');await db.query("UPDATE properties SET status='active' WHERE id=$1",[property]);
await as(other);await rpc('save_buyer_search',['Other',{max_price:25000},{max_price:'25000'},true]);
await db.exec('RESET ROLE');await db.exec("ALTER TABLE notifications ADD CONSTRAINT fail_alert CHECK(title<>'New property matching your search') NOT VALID");await db.query("UPDATE properties SET price=22000 WHERE id=$1",[property]);
await as(null,'service_role');await assert.rejects(rpc('process_saved_search_events'),/fail_alert/);
await db.exec('RESET ROLE');await db.exec('ALTER TABLE notifications DROP CONSTRAINT fail_alert');await as(null,'service_role');assert.equal(await rpc('process_saved_search_events'),1);assert.equal(await rpc('claim_search_alert_email',['alerts@brickinfinity.com']),null);
await as(buyer);await rpc('manage_buyer_search',[sid,'delete']);assert.equal((await rpc('get_buyer_searches')).searches.length,0);
// Exact numeric/amenity/location/freshness semantics and hard publication gates.
await db.exec('RESET ROLE');
for (const [filter,expected] of [[{max_price:22000,min_area:1200},true],[{max_price:21999},false],[{min_area:1201},false],[{city_id:city},true],[{city_id:uuid(999)},false],[{amenities:['Lift','Gym']},true],[{amenities:['Lift','Pool']},false],[{terms:['office']},true],[{terms:['unmatched phrase']},false],[{confirmed_recent:'1'},true]]) {
 assert.equal((await db.query('SELECT brick_private.matches_buyer_search($1,$2) AS r',[property,filter])).rows[0].r,expected,JSON.stringify(filter));
}
await db.query("UPDATE properties SET verification_status='pending' WHERE id=$1",[property]);await as(null,'anon');assert.deepEqual(await rpc('get_comparison_properties',[[property]]),[]);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET verification_status='approved' WHERE id=$1",[property]);
// Private viewing history is physically bounded and daily cleanup expires old rows.
const recentIds=[];for(let n=200;n<301;n++){
 const pid=uuid(n);await db.query("INSERT INTO properties(id,seller_id,title,status,verification_status,availability_status) VALUES($1,$2,'Recent property','active','approved','available')",[pid,seller]);recentIds.push(pid);
}
await as(buyer);for(const pid of recentIds)await rpc('record_buyer_property_view',[pid]);assert.equal((await rpc('get_buyer_activity',['viewed',0])).total,100);
await db.exec('RESET ROLE');await db.query("UPDATE buyer_property_views SET viewed_at=now()-interval '91 days' WHERE user_id=$1",[buyer]);
await as(null,'service_role');await rpc('process_saved_search_events');await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int n FROM buyer_property_views')).rows[0].n,0);
// Native history/queues and service-only email claims cannot be read or forged by buyers.
await as(other);for(const table of ['buyer_property_views','saved_searches','saved_search_matches','saved_search_listing_events'])await assert.rejects(db.query('SELECT * FROM '+table),/permission denied/);
await assert.rejects(rpc('claim_search_alert_email',['alerts@brickinfinity.com']),/permission denied/);
const largeCriteria={max_price:25000,keyword_city_ids:Array.from({length:150},()=>randomUUID())};const largeId=await rpc('save_buyer_search',['Large location search',largeCriteria,{},false]);assert.equal(await rpc('save_buyer_search',['Duplicate large search',largeCriteria,{},false]),largeId);

// Profile IDs and Auth IDs are distinct in real projects; derive each in the right namespace.
const profileId=uuid(800),authId=uuid(801);await db.exec('RESET ROLE');
await db.query("INSERT INTO public.users VALUES($1,$2,'buyer')",[profileId,authId]);await db.query("INSERT INTO auth.users VALUES($1,'different-auth@example.com',now())",[authId]);
await as(profileId);await assert.rejects(rpc('get_buyer_activity'),/Sign in/);
await as(authId);const splitSearch=await rpc('save_buyer_search',['Separate IDs',{max_price:25000},{max_price:'25000'},true]);await rpc('record_buyer_property_view',[property]);assert.equal((await rpc('get_buyer_activity',['viewed',0])).total,1);await rpc('toggle_buyer_favorite',[property]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT user_id FROM saved_searches WHERE id=$1',[splitSearch])).rows[0].user_id,profileId);assert.equal((await db.query('SELECT user_id FROM favorites WHERE user_id=$1 AND property_id=$2',[authId,property])).rows[0].user_id,authId);
await db.query('UPDATE properties SET price=23000 WHERE id=$1',[property]);await as(null,'service_role');for(let batch=0;batch<5;batch++)await rpc('process_saved_search_events');const splitClaim=await rpc('claim_search_alert_email',['alerts@brickinfinity.com']);assert.equal(splitClaim.to,'different-auth@example.com');
console.log('PASS: structured matching, lifecycle/public guards, dedupe, notification rollback, private activity categories, comparison limits, verified-email consent, leased retries, immutable payload and opt-out.');await db.close();
