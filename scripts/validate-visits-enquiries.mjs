import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE SCHEMA brick_private;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.users(id uuid PRIMARY KEY,user_id uuid,role text);
 CREATE FUNCTION brick_private.actor() RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT to_jsonb(u) FROM public.users u WHERE user_id=auth.uid() $$;
 GRANT USAGE ON SCHEMA auth,brick_private TO anon,authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid(),brick_private.actor() TO authenticated,anon;
 CREATE TABLE properties(id uuid PRIMARY KEY,seller_id uuid,title text,status text,availability_status text,deleted_at timestamptz);
 CREATE FUNCTION brick_private.public_listing(pid uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM properties WHERE id=pid AND status='active' AND deleted_at IS NULL) $$;
 CREATE TABLE leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid,seller_id uuid,buyer_name text,buyer_phone text,buyer_email text,message text,status text,contacted boolean);
 CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,title text,message text,type text,category text,link_url text,action_label text,entity_type text,entity_id uuid);
`);
await db.exec(await readFile('supabase/migrations/20261112_visits_enquiry_tracking.sql','utf8'));
const ids = Array.from({length: 8}, (_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [buyer,seller,other,property,hidden] = ids;
await db.query(`INSERT INTO users VALUES($1,$1,'buyer'),($2,$2,'seller'),($3,$3,'buyer')`, [buyer,seller,other]);
await db.query(`INSERT INTO properties VALUES($1,$2,'Test property','active','available',NULL),($3,$2,'Hidden property','pending','available',NULL)`,[property,seller,hidden]);
async function as(id) { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id || '']); await db.exec('SET ROLE authenticated'); }
async function fail(fn,pattern) { await assert.rejects(fn,pattern); }
let keyCounter=20;
const newKey=()=>`10000000-0000-4000-8000-${String(keyCounter++).padStart(12,'0')}`;
async function submit({pid=property,key=newKey(),time=null,name='Buyer',phone='9876543210',message='Interested'}={}) {
 return (await db.query('SELECT submit_property_enquiry($1,$2,$3,$4,$5,$6,$7) AS r',[pid,key,name,phone,'buyer@example.com',message,time])).rows[0].r;
}
async function update(id,action,note='',time=null) { return db.query('SELECT update_property_enquiry($1,$2,$3,$4)',[id,action,note,time]); }
async function list(s=false,offset=0) { return (await db.query('SELECT list_property_enquiries($1,$2) AS r',[s,offset])).rows[0].r; }
await as(null); await fail(()=>submit(),/Sign in/);
await as(buyer); await fail(()=>submit({pid:hidden}),/not accepting/);await fail(()=>submit({phone:'123'}),/valid Indian/);await fail(()=>submit({name:' '}),/Enter your name/);
const key=newKey(), first=await submit({key});
assert.equal((await submit({key})).id, first.id);
assert.equal((await list()).total,1); assert.equal((await list(true)).total,0);
await fail(()=>submit({key,message:'Different'}),/already used/);
await fail(()=>update(first.id,'confirmed'),/No visit/);
await fail(()=>update(first.id,'read'),/cannot be changed/);
await as(other);assert.equal((await list()).total,0);await fail(()=>update(first.id,'read'),/not found/);
await fail(()=>db.query('SELECT * FROM property_enquiries'),/permission denied/);
await fail(()=>db.query('INSERT INTO enquiry_events(enquiry_id,action) VALUES($1,$2)',[first.id,'forged']),/permission denied/);
await as(seller);await fail(()=>submit(),/own property/);
assert.equal((await list(true)).total,1);await update(first.id,'read');await update(first.id,'contacted');
await as(buyer);assert.equal((await list()).items[0].status,'contacted');assert.ok((await list()).items[0].contacted_at);
// Future 11 AM IST, safely beyond one hour, within the booking window.
const future=new Date();future.setUTCDate(future.getUTCDate()+2);future.setUTCHours(5,30,0,0);
await fail(()=>submit({time:new Date(Date.now()-1000).toISOString()}),/Choose a visit/);
const late=new Date(future);late.setUTCHours(18);await fail(()=>submit({time:late.toISOString()}),/Choose a visit/);
const visit=await submit({time:future.toISOString()});await fail(()=>submit({time:future.toISOString()}),/already have an open/);
await fail(()=>update(visit.id,'confirmed'),/cannot be changed/);
await as(seller);await update(visit.id,'confirmed');await fail(()=>update(visit.id,'closed'),/Cancel or complete/);await fail(()=>update(visit.id,'completed'),/cannot be changed/);
await as(other);const overlap=await submit({time:future.toISOString()});
await as(seller);await fail(()=>update(overlap.id,'confirmed'),/overlaps/);await fail(()=>update(overlap.id,'declined'),/explain/);await update(overlap.id,'declined','Please choose another time.');
await as(buyer);await fail(()=>update(visit.id,'cancelled'),/explain/);await update(visit.id,'cancelled','Plans changed');
const next=new Date(future);next.setUTCHours(7);await update(visit.id,'reschedule','New time',next.toISOString());
assert.equal((await list()).items.find(x=>x.id===visit.id).visit_status,'requested');
await as(seller);await update(visit.id,'confirmed');
// A notification failure must roll back the whole enquiry and lead insert.
await db.exec('RESET ROLE');await db.exec("ALTER TABLE notifications ADD CONSTRAINT fail_delivery CHECK(title<>'New property enquiry') NOT VALID");
await as(other);const before=(await list()).total;await fail(()=>submit(),/fail_delivery/);assert.equal((await list()).total,before);
await db.exec('RESET ROLE');await db.exec('ALTER TABLE notifications DROP CONSTRAINT fail_delivery');
// Inactive property retains enquiry history but blocks visit confirmation.
await db.query("UPDATE properties SET status='pending' WHERE id=$1",[property]);
await as(other);await fail(()=>update(overlap.id,'reschedule','',future.toISOString()),/no longer accepting/);
assert.equal((await list()).total,1);
await as(seller);await update(visit.id,'cancelled','Property under review');await update(visit.id,'closed');
assert.equal((await list(true)).total,3);await as(buyer);await fail(()=>update(visit.id,'reschedule','',future.toISOString()),/Only the buyer/);
await db.exec('RESET ROLE');await db.query("UPDATE properties SET status='active' WHERE id=$1",[property]);
// Legacy lead contact action is reflected in buyer tracking and notification history.
await as(other);const legacy=await submit();
await db.exec('RESET ROLE');await db.exec('GRANT UPDATE,SELECT ON leads TO authenticated');
await as(seller);await db.query('SELECT mark_property_lead_contacted($1)',[legacy.lead_id]);
await as(other);assert.equal((await list()).items.find(x=>x.id===legacy.id).status,'contacted');
// Daily limit, pagination and notification creation are all checked in SQL.
await as(buyer);for(let i=0;i<8;i++) await submit();await fail(()=>submit(),/daily limit/);
assert.equal((await list()).total,10);assert.equal((await list(false,10)).items.length,0);
await db.exec('RESET ROLE');assert.ok((await db.query('SELECT count(*)::int AS n FROM notifications')).rows[0].n>=10);
await db.exec('SET ROLE anon');await fail(()=>db.query('SELECT list_property_enquiries(false,0)'),/permission denied/);
console.log('PASS: enquiry delivery transaction, idempotency, participants, RLS, status transitions, visit validation/overlap, legacy inbox, limits and history.');
await db.close();
