import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const ids={admin:'00000000-0000-0000-0000-000000000001',owner:'00000000-0000-0000-0000-000000000002',other:'00000000-0000-0000-0000-000000000003',builder:'00000000-0000-0000-0000-000000000004',buyer:'00000000-0000-0000-0000-000000000005',legacy:'00000000-0000-0000-0000-000000000010',staffListing:'00000000-0000-0000-0000-000000000011',property:'00000000-0000-0000-0000-000000000012',project:'00000000-0000-0000-0000-000000000013',evidence:'00000000-0000-0000-0000-000000000020',builderEvidence:'00000000-0000-0000-0000-000000000021'};
const setupSchema=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TYPE role_type AS ENUM('buyer','seller','admin');CREATE TYPE kyc_type AS ENUM('not_submitted','pending','approved','rejected');CREATE TYPE seller_type AS ENUM('basic','pending_seller','active','pending_admin','admin_review_required');
CREATE TYPE prop_status AS ENUM('draft','pending','active','approved','rejected');CREATE TYPE verification_type AS ENUM('awaiting_ownership','ownership_submitted','ownership_approved','approved','ownership_rejected','listing_rejected','edited_requires_review');CREATE TYPE doc_status AS ENUM('pending','approved','rejected');
CREATE TABLE public.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,full_name text,role role_type DEFAULT 'buyer',kyc_status kyc_type DEFAULT 'not_submitted',seller_status seller_type DEFAULT 'basic');
CREATE TABLE public.properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),seller_id uuid,deleted_at timestamptz,title text,description text,price numeric,brokerage_charge numeric,city_id uuid,locality_id uuid,ownership_verified boolean DEFAULT false,status prop_status DEFAULT 'draft',verification_status verification_type DEFAULT 'awaiting_ownership',rejection_reason text,approved_at timestamptz,updated_at timestamptz,views_count integer DEFAULT 0,availability_status text DEFAULT 'unknown',available_from date,availability_confirmed_at timestamptz,is_featured boolean DEFAULT false,featured_until timestamptz,featured_rank integer,featured_plan_key text);
CREATE TABLE public.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,property_id uuid,document_type text,document_subtype text,status doc_status DEFAULT 'pending',document_url text,reviewed_at timestamptz,reviewed_by uuid,rejection_reason text,created_at timestamptz DEFAULT now());
CREATE TABLE public.document_versions(id uuid DEFAULT gen_random_uuid(),document_id uuid,document_url text,uploaded_by uuid);
CREATE TABLE public.property_images(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid,image_url text,sort_order integer DEFAULT 0);
CREATE TABLE public.property_videos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),property_id uuid,video_url text);
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
INSERT INTO storage.buckets VALUES('identity-documents',true),('ownership-documents',true),('property-media',true);
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO authenticated;GRANT SELECT ON public.properties,storage.objects TO anon;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY old_users ON public.users FOR ALL TO authenticated USING(true) WITH CHECK(true);CREATE POLICY old_properties ON public.properties FOR ALL TO authenticated USING(true) WITH CHECK(true);CREATE POLICY old_public ON public.properties FOR SELECT TO anon USING(true);CREATE POLICY old_docs ON public.documents FOR ALL TO authenticated USING(true) WITH CHECK(true);CREATE POLICY old_storage ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);CREATE POLICY old_storage_public ON storage.objects FOR SELECT TO anon USING(true);`;
// The supplied live schema uses varchar statuses; also retain enum coverage.
const testSchema=process.argv.includes('--text-schema') ? setupSchema
  .replace('role role_type','role varchar').replace('kyc_status kyc_type','kyc_status varchar')
  .replace('seller_status seller_type','seller_status varchar').replace('status prop_status','status varchar')
  .replace('verification_status verification_type','verification_status varchar(20)').replace('status doc_status','status varchar') : setupSchema;
await db.exec(testSchema);
for(const [key,id] of Object.entries(ids).filter(([k])=>['admin','owner','other','builder','buyer'].includes(k))) await db.query("INSERT INTO public.users(id,user_id,full_name,role,kyc_status,seller_status) VALUES($1,$1,$2,$3,'approved','active')",[id,key,key==='admin'?'admin':key==='buyer'?'buyer':'seller']);
await db.query("INSERT INTO public.properties(id,seller_id,title,status,verification_status,ownership_verified) VALUES($1,$2,'Legacy','active','approved',true),($3,$4,'Admin legacy','active','approved',true)",[ids.legacy,ids.owner,ids.staffListing,ids.admin]);
const migration=fs.readFileSync('supabase/migrations/20261111_owner_only_verification.sql','utf8');await db.exec(migration);await db.exec(migration);
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.legacy])).rows[0].status,'pending');
assert.equal((await db.query('SELECT ownership_verified FROM public.properties WHERE id=$1',[ids.staffListing])).rows[0].ownership_verified,false);
async function as(key){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[key?ids[key]:'']);await db.exec(`SET ROLE ${key?'authenticated':'anon'}`);}
await as('owner');
for(const statement of ["UPDATE public.users SET role='admin' WHERE id=$1","UPDATE public.users SET kyc_status='rejected' WHERE id=$1","UPDATE public.users SET owner_declaration_at=now() WHERE id=$1"]){await assert.rejects(db.query(statement,[ids.owner]),/reviewed workflows|checked staff/);}
await assert.rejects(db.query('SELECT public.declare_owner_identity($1,true)',['agent']),/owner-only/);
await assert.rejects(db.query('SELECT public.declare_owner_identity($1,false)',['owner']),/owner-only/);
await db.query("SELECT public.declare_owner_identity('owner',true)");
const insert="INSERT INTO public.properties(id,seller_id,title,description,owner_kind,owner_legal_name,owner_attested,status) VALUES($1,$2,'Actual property','Clean','owner','Legal Owner',true,'draft')";
await db.query(insert,[ids.property,ids.owner]);
await assert.rejects(db.query('UPDATE public.properties SET ownership_verified=true WHERE id=$1',[ids.property]),/reviewed workflows|checked staff/);
await assert.rejects(db.query("UPDATE public.properties SET status='active',verification_status='approved' WHERE id=$1",[ids.property]),/reviewed workflows|checked staff/);
await assert.rejects(db.query('UPDATE public.properties SET brokerage_charge=1000 WHERE id=$1',[ids.property]),/Brokerage/);
await assert.rejects(db.query("INSERT INTO public.documents(user_id,property_id,document_type,document_url,status) VALUES($1,$2,'ownership','fake','approved')",[ids.owner,ids.property]),/pending documents/);
await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[ids.property+'/proof.pdf']);
await db.query("INSERT INTO public.documents(id,user_id,property_id,document_type,document_url) VALUES($1,$2,$3,'ownership',$4)",[ids.evidence,ids.owner,ids.property,ids.property+'/proof.pdf']);
const checks={identity_matches:true,property_matches:true,owns_property:true,no_agent:true};
await assert.rejects(db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.evidence,checks,'Checked']),/Admin access/);
await db.exec('RESET ROLE');
// Deployed legacy triggers may rely on public tables being in the caller path.
await db.exec(`CREATE FUNCTION public.legacy_review_side_effect() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM count(*) FROM documents WHERE document_type='ownership'; PERFORM count(*) FROM properties; PERFORM count(*) FROM users; RETURN NEW; END $$;
CREATE TRIGGER legacy_document_review AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.legacy_review_side_effect();
CREATE TRIGGER legacy_property_review AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.legacy_review_side_effect();
CREATE TRIGGER legacy_user_review AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.legacy_review_side_effect();`);
await as('admin');
await assert.rejects(db.query('SELECT public.review_property_ownership($1,false,$2,$3)',[ids.evidence,{},'Ownership details missing']),/relation "documents" does not exist/);
await db.exec('RESET ROLE');
assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[ids.evidence])).rows[0].status,'pending');
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ownership_reviews')).rows[0].n,0);
const compatibility=fs.readFileSync('supabase/migrations/20261111_owner_review_trigger_compatibility.sql','utf8');
await db.exec(compatibility);await db.exec(compatibility);
await as('owner');await assert.rejects(db.exec('CREATE TABLE public.documents_shadow_test(id int)'),/permission denied/);
await db.exec('CREATE TEMP TABLE documents(untrusted int)');
await as('admin');
await db.exec('BEGIN');
await db.query('SELECT public.review_property_ownership($1,false,$2,$3)',[ids.evidence,{},'Ownership details missing']);
assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[ids.evidence])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.property])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT note FROM public.ownership_reviews WHERE document_id=$1',[ids.evidence])).rows[0].note,'Ownership details missing');
await db.exec('ROLLBACK');await db.exec('RESET ROLE');await db.exec('DROP TABLE pg_temp.documents');
// Seed previously approved identity evidence, as existing deployments already have KYC records.
for(const owner of [ids.owner,ids.builder]) for(const type of ['aadhar','selfie']) {await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[owner,type,owner+'/'+type+'/proof']);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[owner+'/'+type+'/proof']);}
await as('admin');
await assert.rejects(db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.evidence,{},'Incomplete']),/all ownership checks/);
await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.evidence,checks,'Owner and property evidence matched']);
await db.query('SELECT public.admin_publish_property($1)',[ids.property]);
await as(null);assert.equal((await db.query('SELECT id FROM public.properties WHERE id=$1',[ids.property])).rows.length,1);
assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='ownership-documents'")).rows.length,0);
await as('other');assert.equal((await db.query('SELECT * FROM public.documents WHERE id=$1',[ids.evidence])).rows.length,0);assert.equal((await db.query("SELECT * FROM storage.objects WHERE name=$1",[ids.property+'/proof.pdf'])).rows.length,0);
await as('owner');await assert.rejects(db.query('DELETE FROM public.documents WHERE id=$1',[ids.evidence]),/retained/);
await db.query('DELETE FROM storage.objects WHERE name=$1',[ids.property+'/proof.pdf']); // Restrictive policy must leave the object intact.
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT * FROM storage.objects WHERE name=$1',[ids.property+'/proof.pdf'])).rows.length,1);
// The browser must submit editable content only, not stale/oversized review states.
const editPage=fs.readFileSync('src/app/(dashboard)/dashboard/edit/[id]/page.tsx','utf8');
const editPayload=editPage.slice(editPage.indexOf('.from("properties")\n        .update({'),editPage.indexOf('if (propertyError)'));
assert.ok(editPayload.includes('title:property.title'));
assert.ok(!/\b(?:status|verification_status)\s*:/.test(editPayload));
await as('owner');
if(process.argv.includes('--text-schema')){
 await assert.rejects(db.query("UPDATE public.properties SET title='Material edit',verification_status='edited_requires_review' WHERE id=$1",[ids.property]),/value too long for type character varying\(20\)/);
 assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.property])).rows[0].status,'active');
}
await db.query("UPDATE public.properties SET title='Material edit' WHERE id=$1",[ids.property]);
await db.exec('RESET ROLE');let row=(await db.query('SELECT * FROM public.properties WHERE id=$1',[ids.property])).rows[0];assert.equal(row.status,'pending');assert.equal(row.listing_reviewed_at,null);assert.equal(row.ownership_verified,true);assert.equal(row.verification_status,'ownership_approved');
// Old approved/rejected listings also re-enter review without client-written states.
for(const oldStatus of ['approved','rejected']){
 await db.exec('RESET ROLE');await db.exec('BEGIN');
 await db.query('UPDATE public.properties SET status=$1 WHERE id=$2',[oldStatus,ids.property]);
 await as('owner');await db.query("UPDATE public.properties SET title='Revised listing content' WHERE id=$1",[ids.property]);
 const saved=(await db.query('SELECT status,verification_status FROM public.properties WHERE id=$1',[ids.property])).rows[0];
 assert.equal(saved.status,'pending');assert.equal(saved.verification_status,'ownership_approved');
 await db.exec('RESET ROLE');await db.exec('ROLLBACK');
}

await as('admin');await db.query('SELECT public.admin_publish_property($1)',[ids.property]);
await as('owner');await db.query("INSERT INTO public.property_images(property_id,image_url) VALUES($1,'/new-photo.jpg')",[ids.property]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.property])).rows[0].status,'pending');
await as('admin');await db.query('SELECT public.admin_publish_property($1)',[ids.property]);
await as('owner');await db.query('SELECT public.confirm_property_availability($1)',[ids.property]);
await db.query('UPDATE public.property_images SET sort_order=2 WHERE property_id=$1',[ids.property]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.property])).rows[0].status,'active');
await as('admin');await db.query("UPDATE public.users SET role='buyer',kyc_status='rejected' WHERE id=$1",[ids.owner]);
await as(null);assert.equal((await db.query('SELECT * FROM public.properties WHERE id=$1',[ids.property])).rows.length,0);
await as('owner');await assert.rejects(db.query('UPDATE public.properties SET price=123 WHERE id=$1',[ids.property]),/Only approved actual owners/);
await as('builder');await db.query("SELECT public.declare_owner_identity('project_owner_builder',true)");
await assert.rejects(db.query(insert,[ids.project,ids.builder]),/actual legal owner/);
await db.query("INSERT INTO public.properties(id,seller_id,title,owner_kind,owner_legal_name,owner_project_name,owner_attested) VALUES($1,$2,'Project','project_owner_builder','Owning Company','Owned Project',true)",[ids.project,ids.builder]);
await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[ids.project+'/company.pdf']);
await db.query("INSERT INTO public.documents(id,user_id,property_id,document_type,document_url) VALUES($1,$2,$3,'ownership',$4)",[ids.builderEvidence,ids.builder,ids.project,ids.project+'/company.pdf']);
await as('admin');await assert.rejects(db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.builderEvidence,checks,'Builder']),/company owns this project/);
await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.builderEvidence,{...checks,company_owns_project:true},'Company/project ownership matched']);
await db.query('SELECT public.admin_publish_property($1)',[ids.project]);
await as('builder');await db.query('UPDATE public.properties SET city_id=$1 WHERE id=$2',[ids.other,ids.project]);
await db.exec('RESET ROLE');const moved=(await db.query('SELECT status,ownership_verified,ownership_reviewed_at FROM public.properties WHERE id=$1',[ids.project])).rows[0];assert.equal(moved.status,'pending');assert.equal(moved.ownership_verified,false);assert.equal(moved.ownership_reviewed_at,null);
assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[ids.builderEvidence])).rows[0].status,'pending');
// Fresh identity onboarding: no self-approval and no public admin-upgrade path.
await as('buyer');await db.query("SELECT public.declare_owner_identity('owner',true)");
const fresh=[];
for(const type of ['aadhar','selfie']){
 const path=ids.buyer+'/'+type+'/fresh.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);
 const result=await db.query("INSERT INTO public.documents(user_id,document_type,document_url) VALUES($1,$2,$3) RETURNING id",[ids.buyer,type,path]);fresh.push(result.rows[0].id);
}
await assert.rejects(db.query("UPDATE public.users SET kyc_status='approved' WHERE id=$1",[ids.buyer]),/reviewed workflows|checked staff/);
await as('admin');await db.query('SELECT public.review_identity_document($1,true,$2)',[fresh[0],'Government ID reviewed']);await db.query('SELECT public.review_identity_document($1,true,$2)',[fresh[1],'Selfie matches identity']);
await db.exec('RESET ROLE');const verified=(await db.query('SELECT role,kyc_status FROM public.users WHERE id=$1',[ids.buyer])).rows[0];assert.equal(verified.role,'seller');assert.equal(verified.kyc_status,'approved');
await as('buyer');await assert.rejects(db.query("UPDATE public.users SET seller_status='pending_admin' WHERE id=$1",[ids.buyer]),/reviewed workflows|checked staff/);
const cross=await db.query("UPDATE public.properties SET is_featured=true WHERE id=$1 RETURNING id",[ids.project]);assert.equal(cross.rows.length,0);
await as('admin');await assert.rejects(db.query('SELECT public.manage_staff_admin($1,false)',[ids.admin]),/Self-removal/);
await db.query('SELECT public.manage_staff_admin($1,true)',[ids.buyer]);
await db.query('SELECT public.manage_staff_admin($1,false)',[ids.buyer]);
await as('buyer');await assert.rejects(db.query('SELECT public.manage_staff_admin($1,true)',[ids.other]),/Staff admin access/);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ownership_reviews')).rows[0].n,2);
// A legacy user trigger can turn a declaration-only edit into inactive seller
// access. Reproduce that exact state, then test checked recovery/preservation.
await db.exec(`CREATE FUNCTION public.legacy_declaration_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.seller_identity IS DISTINCT FROM OLD.seller_identity THEN NEW.seller_status:='basic'; END IF; RETURN NEW; END $$;
CREATE TRIGGER legacy_declaration_status BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.legacy_declaration_status();`);
await as('builder');await db.query("SELECT public.declare_owner_identity('owner',true)");
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.builder])).rows[0].seller_status,'basic');
const declarationAccess=fs.readFileSync('supabase/migrations/20261111_declaration_seller_access.sql','utf8');await db.exec(declarationAccess);await db.exec(declarationAccess);
await as('builder');await assert.rejects(db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.builder,'Self restore']),/Staff admin/);
await db.query("SELECT public.declare_owner_identity('project_owner_builder',true)");
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.builder])).rows[0].seller_status,'basic');
await as('admin');await assert.rejects(db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.builder,' ']),/review note/);
await db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.builder,'Current ID, selfie files and declaration reviewed']);
await db.exec('RESET ROLE');await db.query("UPDATE public.properties SET status='active',verification_status='approved',ownership_verified=true,ownership_review_status='approved',ownership_reviewed_at=now(),identity_reviewed_at=now(),listing_reviewed_at=now() WHERE id=$1",[ids.project]);
await as('builder');await db.query("SELECT public.declare_owner_identity('owner',true)");
await db.exec('RESET ROLE');const preserved=(await db.query('SELECT role,seller_status,kyc_status FROM public.users WHERE id=$1',[ids.builder])).rows[0];assert.equal(preserved.role,'seller');assert.equal(preserved.seller_status,'active');assert.equal(preserved.kyc_status,'approved');
const paused=(await db.query('SELECT status,ownership_verified,ownership_reviewed_at FROM public.properties WHERE id=$1',[ids.project])).rows[0];assert.equal(paused.status,'pending');assert.equal(paused.ownership_verified,false);assert.equal(paused.ownership_reviewed_at,null);
await as('builder');await db.query("SELECT public.declare_owner_identity('project_owner_builder',true)");
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.builder])).rows[0].seller_status,'active');
await as('admin');await db.query("UPDATE public.users SET role='buyer' WHERE id=$1",[ids.builder]);
await as('builder');await db.query("SELECT public.declare_owner_identity('owner',true)");
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT role FROM public.users WHERE id=$1',[ids.builder])).rows[0].role,'buyer');
await as('admin');await assert.rejects(db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.owner,'Review rejected identity']),/Approved government ID/);
await assert.rejects(db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.other,'Review missing evidence']),/Approved government ID/);
await db.exec('RESET ROLE');ids.fresh='00000000-0000-0000-0000-000000000090';await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status) VALUES($1,$1,'buyer','approved','basic')",[ids.fresh]);
for(const type of ['aadhar','selfie']){const path=ids.fresh+'/'+type+'/reviewed';await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[ids.fresh,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
await as('fresh');await db.query("SELECT public.declare_owner_identity('owner',true)");
await db.exec('RESET ROLE');const firstAccess=(await db.query('SELECT role,seller_status FROM public.users WHERE id=$1',[ids.fresh])).rows[0];assert.equal(firstAccess.role,'seller');assert.equal(firstAccess.seller_status,'active');
console.log('Declaration-access checks passed: reproduced legacy inactive status, checked staff recovery, active owner/builder switches preserve access while pausing listings, demotion cannot self-reactivate, fresh verified onboarding.');
// Permanent reviewed category changes, after all prior migration regressions.
await db.exec('RESET ROLE');
await db.exec('ALTER TABLE storage.buckets ADD COLUMN name text, ADD COLUMN file_size_limit bigint, ADD COLUMN allowed_mime_types text[]');
const reviewedChanges=fs.readFileSync('supabase/migrations/20261111_reviewed_declaration_changes.sql','utf8');
await db.exec(`CREATE FUNCTION public.unsafe_profile_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role::text='seller' AND NEW.kyc_status::text='approved' THEN NEW.seller_status:='basic'; END IF; RETURN NEW; END $$;
CREATE TRIGGER unsafe_profile_default BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.unsafe_profile_default();`);
await assert.rejects(db.exec(reviewedChanges),/legacy trigger changed account access/);await db.exec('ROLLBACK');
assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='declaration_locked_at'")).rows[0].n,0);
assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.fresh])).rows[0].seller_status,'active');
await db.exec('DROP TRIGGER unsafe_profile_default ON public.users;DROP FUNCTION public.unsafe_profile_default()');
// The SQL Editor/extended-query path must accept the complete file as one
// statement, including repeat execution against already-created objects.
await db.query(reviewedChanges);await db.query(reviewedChanges);
assert.ok((await db.query('SELECT declaration_locked_at FROM public.users WHERE id=$1',[ids.fresh])).rows[0].declaration_locked_at);
assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='declaration-documents'")).rows[0].public,false);
await as('fresh');await assert.rejects(db.query("SELECT public.declare_owner_identity('project_owner_builder',true)"),/locked/);
await assert.rejects(db.query('UPDATE public.users SET declaration_locked_at=NULL WHERE id=$1',[ids.fresh]),/reviewed declaration/);
await assert.rejects(db.query("UPDATE public.users SET seller_legal_name='Fake Company' WHERE id=$1",[ids.fresh]),/reviewed declaration/);
await assert.rejects(db.query('SELECT brick_private.apply_declared_identity($1,$2,$3)',[ids.fresh,'project_owner_builder','Fake']),/permission denied/);
await db.exec('BEGIN');await db.query("UPDATE public.users SET kyc_status='pending' WHERE id=$1",[ids.fresh]);
await assert.rejects(db.query("SELECT public.declare_owner_identity('project_owner_builder',true)"),/locked/);await db.exec('ROLLBACK');
// Unverified applicants still edit freely; the boundary becomes sticky on review.
await db.exec('RESET ROLE');ids.unverified='00000000-0000-0000-0000-000000000091';await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status) VALUES($1,$1,'buyer','pending','basic')",[ids.unverified]);
await as('unverified');await db.query("SELECT public.declare_owner_identity('owner',true)");await db.query("SELECT public.declare_owner_identity('project_owner_builder',true)");
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT declaration_locked_at FROM public.users WHERE id=$1',[ids.unverified])).rows[0].declaration_locked_at,null);
// Establish a genuinely reviewed live property before requesting a new category.
ids.reviewedProperty='00000000-0000-0000-0000-000000000092';ids.reviewedProof='00000000-0000-0000-0000-000000000093';
await as('fresh');await db.query("INSERT INTO public.properties(id,seller_id,title,owner_kind,owner_legal_name,owner_attested) VALUES($1,$2,'Reviewed owner property','owner','Verified Owner',true)",[ids.reviewedProperty,ids.fresh]);
await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[ids.reviewedProperty+'/proof.pdf']);
await db.query("INSERT INTO public.documents(id,user_id,property_id,document_type,document_url) VALUES($1,$2,$3,'ownership',$4)",[ids.reviewedProof,ids.fresh,ids.reviewedProperty,ids.reviewedProperty+'/proof.pdf']);
await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[ids.reviewedProof,checks,'Owner proof matched']);await db.query('SELECT public.admin_publish_property($1)',[ids.reviewedProperty]);
const changeFile=ids.fresh+'/change/proof.pdf';
await as('fresh');await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('declaration-documents',$1)",[changeFile]);
async function submitChange(kind='project_owner_builder',paths=[changeFile]){return (await db.query('SELECT public.submit_declaration_change($1,$2,$3,true,$4) AS id',[kind,kind==='owner'?'Verified Owner':'Reviewed Owning Company','The legal ownership capacity has changed.',paths])).rows[0].id;}
await assert.rejects(submitChange('agent'),/permitted capacity/);
await assert.rejects(submitChange('project_owner_builder',[]),/Upload 1/);
await assert.rejects(submitChange('project_owner_builder',[ids.builder+'/other.pdf']),/Upload 1/);
const request=await submitChange();await assert.rejects(submitChange(),/already pending/);
assert.equal((await db.query('SELECT seller_identity FROM public.users WHERE id=$1',[ids.fresh])).rows[0].seller_identity,'owner');
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[ids.reviewedProperty])).rows[0].status,'active');
await assert.rejects(db.query("UPDATE public.declaration_change_requests SET status='approved' WHERE id=$1",[request]),/permission denied/);
await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[request,{},'Self approval']),/Staff admin/);
await db.query("DELETE FROM storage.objects WHERE bucket_id='declaration-documents' AND name=$1",[changeFile]);
await db.exec('RESET ROLE');assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE name=$1",[changeFile])).rows[0].n,1);
await as('builder');assert.equal((await db.query('SELECT * FROM public.declaration_change_requests WHERE id=$1',[request])).rows.length,0);
assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='declaration-documents' AND name=$1",[changeFile])).rows.length,0);
await assert.rejects(db.query('SELECT public.cancel_declaration_change($1)',[request]),/not found/);
await as(null);await assert.rejects(db.query('SELECT * FROM public.declaration_change_requests'),/permission denied/);assert.equal((await db.query("SELECT * FROM storage.objects WHERE bucket_id='declaration-documents'")).rows.length,0);
const capacityChecks={identity_matches:true,capacity_supported:true,no_agent:true};
await as('admin');await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[request,{},'Incomplete checklist']),/every declaration review/);
await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[request,capacityChecks,' ']),/review decision and note/);
await db.query('SELECT public.review_declaration_change($1,false,$2,$3)',[request,{},'Evidence does not establish company ownership.']);
await as('fresh');assert.equal((await db.query('SELECT seller_identity FROM public.users WHERE id=$1',[ids.fresh])).rows[0].seller_identity,'owner');
const approvedRequest=await submitChange();
await as('admin');await db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[approvedRequest,capacityChecks,'Identity and owning company evidence match.']);
await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[approvedRequest,capacityChecks,'Duplicate decision']),/already been decided/);
await db.exec('RESET ROLE');const reviewedAccount=(await db.query('SELECT * FROM public.users WHERE id=$1',[ids.fresh])).rows[0];assert.equal(reviewedAccount.seller_identity,'project_owner_builder');assert.equal(reviewedAccount.seller_legal_name,'Reviewed Owning Company');assert.equal(reviewedAccount.role,'seller');assert.equal(reviewedAccount.seller_status,'active');
const withdrawn=(await db.query('SELECT * FROM public.properties WHERE id=$1',[ids.reviewedProperty])).rows[0];assert.equal(withdrawn.status,'pending');assert.equal(withdrawn.ownership_verified,false);assert.equal(withdrawn.ownership_reviewed_at,null);assert.equal(withdrawn.listing_reviewed_at,null);
await as('fresh');const cancelled=await submitChange('owner');await db.query('SELECT public.cancel_declaration_change($1)',[cancelled]);
await as('admin');await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[cancelled,capacityChecks,'Cancelled decision']),/already been decided/);
// Approval can update capacity for an inactive account, but never restore access.
await db.query("UPDATE public.users SET role='buyer',seller_status='basic' WHERE id=$1",[ids.fresh]);
await as('fresh');const inactiveRequest=await submitChange('owner');
await as('admin');await db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[inactiveRequest,capacityChecks,'Capacity approved; suspension remains.']);
await db.exec('RESET ROLE');const inactiveAfter=(await db.query('SELECT role,seller_status,seller_identity FROM public.users WHERE id=$1',[ids.fresh])).rows[0];assert.equal(inactiveAfter.role,'buyer');assert.equal(inactiveAfter.seller_status,'basic');assert.equal(inactiveAfter.seller_identity,'owner');
await as('fresh');await db.query("SELECT public.declare_owner_identity('owner',true)");assert.equal((await db.query('SELECT role FROM public.users WHERE id=$1',[ids.fresh])).rows[0].role,'buyer');
const revokedRequest=await submitChange();await as('admin');await db.query("UPDATE public.users SET kyc_status='rejected' WHERE id=$1",[ids.fresh]);
await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[revokedRequest,capacityChecks,'Reject outdated identity']),/Current approved government ID/);
await db.query('SELECT public.review_declaration_change($1,false,$2,$3)',[revokedRequest,{},'Complete identity re-review first.']);
// First declaration after identity approval still finishes onboarding, even
// though the sticky verification boundary was established before declaration.
await db.exec('RESET ROLE');ids.initial='00000000-0000-0000-0000-000000000094';await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status) VALUES($1,$1,'buyer','approved','basic')",[ids.initial]);
for(const type of ['aadhar','selfie']){const path=ids.initial+'/'+type+'/reviewed';await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[ids.initial,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
await as('initial');await db.query("SELECT public.declare_owner_identity('owner',true)");assert.equal((await db.query('SELECT role,seller_status FROM public.users WHERE id=$1',[ids.initial])).rows[0].seller_status,'active');
const initialFile=ids.initial+'/change/proof.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('declaration-documents',$1)",[initialFile]);
const initialRequest=(await db.query('SELECT public.submit_declaration_change($1,$2,$3,true,$4) AS id',['project_owner_builder','Initial Company','Documented company ownership change.',[initialFile]])).rows[0].id;
await db.exec('RESET ROLE');await db.exec('BEGIN');await db.query("UPDATE public.users SET role='admin' WHERE id=$1",[ids.initial]);await as('initial');await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[initialRequest,capacityChecks,'Own request']),/own declaration/);await db.exec('ROLLBACK');
await db.exec('RESET ROLE');await db.exec('BEGIN');await db.query("UPDATE public.users SET seller_identity='project_owner_builder' WHERE id=$1",[ids.initial]);await as('admin');await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[initialRequest,capacityChecks,'Stale request']),/effective declaration has changed/);await db.exec('ROLLBACK');
await db.exec('RESET ROLE');await db.exec('BEGIN');await db.query("DELETE FROM storage.objects WHERE bucket_id='declaration-documents' AND name=$1",[initialFile]);await as('admin');await assert.rejects(db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[initialRequest,capacityChecks,'Missing file']),/evidence is missing/);await db.exec('ROLLBACK');
await as('admin');await db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[initialRequest,capacityChecks,'Capacity and current identity files reviewed.']);
await db.exec('RESET ROLE');assert.equal((await db.query("SELECT jsonb_array_length(review_checks->'identity_evidence') AS n FROM public.declaration_change_requests WHERE id=$1",[initialRequest])).rows[0].n,2);
// ID files referenced by a declaration decision remain protected after a new
// upload supersedes the current document row and no ownership review exists.
await db.query("UPDATE public.documents SET status='pending',document_url=$1 WHERE user_id=$2 AND document_type='aadhar'",[ids.initial+'/aadhar/new',ids.initial]);
await as('initial');await db.query("DELETE FROM storage.objects WHERE bucket_id='identity-documents' AND name=$1",[ids.initial+'/aadhar/reviewed']);
await db.exec('RESET ROLE');assert.equal((await db.query("SELECT count(*)::int AS n FROM storage.objects WHERE name=$1",[ids.initial+'/aadhar/reviewed'])).rows[0].n,1);
// Auth UUID and public profile UUID are different in real deployments.
const profileUuid='00000000-0000-0000-0000-000000000095',authUuid='00000000-0000-0000-0000-000000000096';
await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status) VALUES($1,$2,'buyer','approved','basic')",[profileUuid,authUuid]);
for(const type of ['aadhar','selfie']){const path=authUuid+'/'+type+'/reviewed';await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[profileUuid,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[authUuid]);await db.exec('SET ROLE authenticated');await db.query("SELECT public.declare_owner_identity('owner',true)");
const distinctPath=authUuid+'/change/proof.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('declaration-documents',$1)",[distinctPath]);
const distinctRequest=(await db.query('SELECT public.submit_declaration_change($1,$2,$3,true,$4) AS id',['project_owner_builder','Distinct Owning Company','Company ownership capacity evidence.',[distinctPath]])).rows[0].id;
assert.equal((await db.query('SELECT user_id FROM public.declaration_change_requests WHERE id=$1',[distinctRequest])).rows[0].user_id,profileUuid);
await as('admin');await db.query('SELECT public.review_declaration_change($1,true,$2,$3)',[distinctRequest,capacityChecks,'Distinct profile/auth identity matched.']);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_identity FROM public.users WHERE id=$1',[profileUuid])).rows[0].seller_identity,'project_owner_builder');
await db.exec(reviewedChanges);
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.declaration_change_requests')).rows[0].n,7);
console.log('Reviewed declaration checks passed: sticky verification lock, free pre-verification edits, one pending request, effective category unchanged pending/rejected/cancelled, private retained evidence, atomic admin approval, property re-review, inactive accounts stay inactive, revoked identity rejected and repeatability.');
// Reproduce the three deployed legacy authorities, then retire only those bindings.
const retirement=fs.readFileSync('supabase/migrations/20261111_retire_legacy_verification_sync.sql','utf8');
if(process.argv.includes('--text-schema')){
 ids.affected='00000000-0000-0000-0000-000000000097';
 const affectedProperty='00000000-0000-0000-0000-000000000098',affectedDoc='00000000-0000-0000-0000-000000000099';
 await db.exec('RESET ROLE');
 await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status,seller_identity,owner_declaration_at) VALUES($1,$1,'buyer','approved','basic','owner',now())",[ids.affected]);
 for(const type of ['aadhar','selfie']){const path=ids.affected+'/'+type+'/reviewed';await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[ids.affected,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
 await as('admin');await db.query('SELECT public.admin_activate_verified_seller($1,$2)',[ids.affected,'Identity and declaration reviewed.']);
 await as('affected');await db.query(insert,[affectedProperty,ids.affected]);
 const affectedPath=affectedProperty+'/proof.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[affectedPath]);
 await db.query("INSERT INTO public.documents(id,user_id,property_id,document_type,document_url) VALUES($1,$2,$3,'ownership',$4)",[affectedDoc,ids.affected,affectedProperty,affectedPath]);
 await db.exec('RESET ROLE');
 await db.exec(`CREATE FUNCTION public.sync_user_verification_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status::text='approved' THEN UPDATE public.users SET seller_status='verified' WHERE id=NEW.user_id AND seller_status::text='active'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER sync_user_verification_trigger AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.sync_user_verification_state();
 CREATE FUNCTION public.sync_property_ownership_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
 CREATE TRIGGER sync_property_ownership_trigger AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.sync_property_ownership_state();
 CREATE FUNCTION public.auto_approve_seller() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kyc_status::text='approved' THEN NEW.seller_status:='verified'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER on_kyc_status_update BEFORE UPDATE OF kyc_status ON public.users FOR EACH ROW EXECUTE FUNCTION public.auto_approve_seller();`);
 await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[affectedDoc,checks,'Exact ownership reviewed.']);
 await db.exec('RESET ROLE');
 assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.affected])).rows[0].seller_status,'verified');
 assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[affectedDoc])).rows[0].status,'pending');
 assert.equal((await db.query('SELECT ownership_review_status FROM public.properties WHERE id=$1',[affectedProperty])).rows[0].ownership_review_status,'approved');
 // A legacy status alone does not authorize restoration.
 const unreviewed='00000000-0000-0000-0000-000000000101';
 await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status) VALUES($1,$1,'seller','approved','verified')",[unreviewed]);
 // An older activation must never override a later staff demotion/revocation.
 const revoked='00000000-0000-0000-0000-000000000103';
 await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status,seller_identity,owner_declaration_at) VALUES($1,$1,'seller','approved','verified','owner',now())",[revoked]);
 for(const type of ['aadhar','selfie']){const path=revoked+'/'+type;await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[revoked,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
 await db.query("INSERT INTO public.account_security_events(user_id,actor_auth_id,action,details,created_at) VALUES($1,$2,'seller_activation_reviewed','{}',now()-interval '2 days'),($1,$2,'account_permissions_changed','{\"old_role\":\"seller\",\"new_role\":\"buyer\",\"old_kyc\":\"approved\",\"new_kyc\":\"approved\"}',now()-interval '1 day')",[revoked,ids.admin]);
 await db.exec(retirement);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('sync_user_verification_trigger','sync_property_ownership_trigger','on_kyc_status_update')")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname IN ('owner_account_changed','guard_owner_documents','legacy_document_review','legacy_property_review','legacy_user_review')")).rows[0].n,5);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM brick_private.retired_verification_triggers")).rows[0].n,3);
 assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[unreviewed])).rows[0].seller_status,'verified');
 assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[revoked])).rows[0].seller_status,'verified');
 assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.affected])).rows[0].seller_status,'active');
 const repaired=(await db.query('SELECT d.status,d.reviewed_at=r.created_at AS same_stamp,d.reviewed_by=r.reviewer_auth_id AS same_reviewer FROM public.documents d JOIN public.ownership_reviews r ON r.document_id=d.id WHERE d.id=$1',[affectedDoc])).rows[0];
 assert.equal(repaired.status,'approved');assert.equal(repaired.same_stamp,true);assert.equal(repaired.same_reviewer,true);
 assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[affectedProperty])).rows[0].status,'pending');
 await as('admin');await db.query('SELECT public.admin_publish_property($1)',[affectedProperty]);
 await db.exec('RESET ROLE');await db.exec(retirement);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM public.account_security_events WHERE user_id=$1 AND action='legacy_seller_activation_restored'",[ids.affected])).rows[0].n,1);
 await as('affected');await assert.rejects(db.query('SELECT * FROM brick_private.retired_verification_triggers'),/permission denied/);
 // Genuine resubmission stays pending on rerun and requires fresh review.
 const replacementPath=affectedProperty+'/new-proof.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[replacementPath]);
 await db.query("UPDATE public.documents SET status='pending',document_url=$1,reviewed_at=NULL,reviewed_by=NULL WHERE id=$2",[replacementPath,affectedDoc]);
 await db.exec('RESET ROLE');await db.exec(retirement);
 assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[affectedDoc])).rows[0].status,'pending');
 await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[affectedDoc,checks,'Replacement evidence reviewed.']);await db.query('SELECT public.admin_publish_property($1)',[affectedProperty]);
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.affected])).rows[0].seller_status,'active');
 // Future registrations activate through the canonical full-ID/selfie workflow.
 ids.future='00000000-0000-0000-0000-000000000102';
 await db.query("INSERT INTO public.users(id,user_id) VALUES($1,$1)",[ids.future]);await as('future');await db.query("SELECT public.declare_owner_identity('owner',true)");
 for(const type of ['aadhar','selfie']){await as('future');const path=ids.future+'/'+type;await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);const doc=(await db.query("INSERT INTO public.documents(user_id,document_type,document_url) VALUES($1,$2,$3) RETURNING id",[ids.future,type,path])).rows[0].id;await as('admin');await db.query('SELECT public.review_identity_document($1,true,$2)',[doc,'Identity/selfie matched.']);}
 await db.exec('RESET ROLE');assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.future])).rows[0].seller_status,'active');
 // Fail closed if a familiar trigger name is bound to an unexpected function.
 await db.exec("CREATE TRIGGER sync_user_verification_trigger AFTER UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.legacy_review_side_effect()");
 await assert.rejects(db.exec(retirement),/Unexpected function on legacy trigger/);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='sync_user_verification_trigger'")).rows[0].n,1);
 await db.exec('DROP TRIGGER sync_user_verification_trigger ON public.documents');
 console.log('Legacy reset reproduced and fixed: audited activation/doc restoration, exact trigger retirement, pending resubmission preserved, publication separate, repeatable migration and future registration.');
}else{await db.exec('RESET ROLE');await db.exec(retirement);await db.exec(retirement);}

// Content edits after ownership rejection must become a real ownership resubmission.
await db.exec('RESET ROLE');
ids.resubmitter='00000000-0000-0000-0000-000000000105';
const resubmittedProperty='00000000-0000-0000-0000-000000000106',resubmittedDoc='00000000-0000-0000-0000-000000000107';
await db.query("INSERT INTO public.users(id,user_id,role,kyc_status,seller_status,seller_identity,owner_declaration_at) VALUES($1,$1,'seller','approved','active','owner',now())",[ids.resubmitter]);
for(const type of ['aadhar','selfie']){const path=ids.resubmitter+'/'+type;await db.query("INSERT INTO public.documents(user_id,document_type,status,document_url) VALUES($1,$2,'approved',$3)",[ids.resubmitter,type,path]);await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('identity-documents',$1)",[path]);}
await as('resubmitter');await db.query(insert,[resubmittedProperty,ids.resubmitter]);
await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[resubmittedProperty+'/proof.pdf']);
await db.query("INSERT INTO public.documents(id,user_id,property_id,document_type,document_url) VALUES($1,$2,$3,'ownership',$4)",[resubmittedDoc,ids.resubmitter,resubmittedProperty,resubmittedProperty+'/proof.pdf']);
await as('admin');await db.query('SELECT public.review_property_ownership($1,false,$2,$3)',[resubmittedDoc,{},'Correct property details.']);
// Reproduce already-stuck pending + rejected evidence before applying the forward fix.
await as('resubmitter');await db.query("UPDATE public.properties SET title='Corrected property details' WHERE id=$1",[resubmittedProperty]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT ownership_review_status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].ownership_review_status,'rejected');
const resubmissionMigration=fs.readFileSync('supabase/migrations/20261111_resubmitted_property_reviews.sql','utf8');
await db.exec('BEGIN');
await db.query("UPDATE public.properties SET ownership_review_status='unreviewed' WHERE id=$1",[resubmittedProperty]);
await db.exec(resubmissionMigration.replace('BEGIN;','').replace('COMMIT;',''));
assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[resubmittedDoc])).rows[0].status,'pending');
await db.exec('ROLLBACK');
await db.exec(resubmissionMigration);
async function assertResubmitted(){
 const row=(await db.query('SELECT p.status,p.ownership_review_status,p.ownership_verified,p.rejection_reason,d.status AS document_status,d.reviewed_at FROM public.properties p JOIN public.documents d ON d.property_id=p.id WHERE d.id=$1',[resubmittedDoc])).rows[0];
 assert.equal(row.status,'pending');assert.equal(row.ownership_review_status,'unreviewed');assert.equal(row.ownership_verified,false);assert.equal(row.document_status,'pending');assert.equal(row.reviewed_at,null);assert.equal(row.rejection_reason,null);
}
await assertResubmitted();await db.exec(resubmissionMigration);await assertResubmitted();
await as('admin');await assert.rejects(db.query('SELECT public.admin_publish_property($1)',[resubmittedProperty]),/reviewed ownership/);
await db.query('SELECT public.review_property_ownership($1,false,$2,$3)',[resubmittedDoc,{},'Needs another correction.']);
await as('resubmitter');await db.query('UPDATE public.properties SET title=title WHERE id=$1',[resubmittedProperty]);
await db.query('UPDATE public.properties SET availability_confirmed_at=now() WHERE id=$1',[resubmittedProperty]);
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'rejected');
await db.query("UPDATE public.properties SET description='Corrected ownership explanation' WHERE id=$1",[resubmittedProperty]);
await assertResubmitted();
await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[resubmittedDoc,checks,'Corrections and retained evidence reviewed.']);await db.query('SELECT public.admin_publish_property($1)',[resubmittedProperty]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM public.ownership_reviews WHERE document_id=$1',[resubmittedDoc])).rows[0].n,3);
assert.equal((await db.query('SELECT seller_status FROM public.users WHERE id=$1',[ids.resubmitter])).rows[0].seller_status,'active');
console.log('Rejected resubmission checks passed: existing stuck edits repaired, new content edits requeue retained evidence, no-op/freshness edits stay rejected, immutable decisions retained and fresh approval required.');

// Explicit rejection/correction submission supersedes auto-requeue for new rejections.
await db.exec('RESET ROLE');
await db.exec('ALTER TABLE storage.objects ADD COLUMN created_at timestamptz DEFAULT now()');
await db.exec(`CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,title text,message text,type text,category text,link_url text,action_label text,entity_type text,entity_id uuid);`);
const workflow=fs.readFileSync('supabase/migrations/20261111_review_submission_workflow.sql','utf8');
await db.exec(workflow);await db.exec(workflow);
// Send the published fixture for fresh ownership review by changing location.
await as('resubmitter');await db.query("UPDATE public.properties SET city_id='00000000-0000-0000-0000-000000000108' WHERE id=$1",[resubmittedProperty]);
await as('other');await assert.rejects(db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5,$6)',[resubmittedProperty,'ownership','Incorrect address','details','Correct the property address.',resubmittedDoc]),/Admin access/);
await as('admin');
await assert.rejects(db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5,$6)',[resubmittedProperty,'ownership','Incorrect address','details','',resubmittedDoc]),/required seller action/);
await assert.rejects(db.query('SELECT public.review_property_ownership($1,false,$2,$3)',[resubmittedDoc,{},'Incomplete old rejection']),/rejection form/);
const requestId=(await db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5,$6) AS id',[resubmittedProperty,'ownership','Incorrect address','details','Correct the description and property address.',resubmittedDoc])).rows[0].id;
await db.exec('RESET ROLE');assert.equal((await db.query("SELECT count(*)::int AS n FROM public.notifications WHERE entity_id=$1 AND title='Ownership submission rejected'",[resubmittedProperty])).rows[0].n,1);
await as('other');assert.equal((await db.query('SELECT * FROM public.property_review_requests WHERE id=$1',[requestId])).rows.length,0);
await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/owner access|Your property/);
await as('resubmitter');
await assert.rejects(db.query('UPDATE public.properties SET review_resubmission_required=false WHERE id=$1',[resubmittedProperty]),/review state/);
await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/Save the requested property corrections/);
await db.query("UPDATE public.properties SET description='Corrected address and ownership explanation' WHERE id=$1",[resubmittedProperty]);
let draft=(await db.query('SELECT status,review_resubmission_required,rejection_reason FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0];
assert.equal(draft.status,'rejected');assert.equal(draft.review_resubmission_required,true);assert.ok(draft.rejection_reason.includes('Incorrect address'));
await as('admin');await assert.rejects(db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[resubmittedDoc,checks,'Cannot approve unsubmitted corrections.']),/must resubmit/);
await as('resubmitter');
await db.query("INSERT INTO public.property_images(property_id,image_url) VALUES($1,'/saved-draft-photo.jpg')",[resubmittedProperty]);
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT public.resubmit_property_review($1) AS queue',[resubmittedProperty])).rows[0].queue,'ownership');
await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/does not need resubmission/);
await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[resubmittedDoc,checks,'Corrected details match retained ownership evidence.']);
// Editorial rejection can require new documents, which invalidates ownership on upload.
await db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5)',[resubmittedProperty,'listing','Evidence needs the full address','both','Correct the address and upload new matching proof.']);
await as('resubmitter');await db.query("UPDATE public.properties SET title='Updated property address' WHERE id=$1",[resubmittedProperty]);
await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/new ownership evidence/);
// A newly inserted row pointing to the previously rejected file is not new evidence.
await db.query("INSERT INTO public.documents(user_id,property_id,document_type,document_url) VALUES($1,$2,'ownership',$3)",[ids.resubmitter,resubmittedProperty,resubmittedProperty+'/proof.pdf']);
await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/new ownership evidence/);
const correctedPath=resubmittedProperty+'/corrected-proof.pdf';
await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[correctedPath]);
const newDoc=(await db.query("INSERT INTO public.documents(user_id,property_id,document_type,document_url) VALUES($1,$2,'ownership',$3) RETURNING id",[ids.resubmitter,resubmittedProperty,correctedPath])).rows[0].id;
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT public.resubmit_property_review($1) AS queue',[resubmittedProperty])).rows[0].queue,'ownership');
await as('admin');await db.query('SELECT public.review_property_ownership($1,true,$2,$3)',[newDoc,checks,'New evidence reviewed.']);
await db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5)',[resubmittedProperty,'listing','Clarify room layout','details','Correct the description of the rooms.']);
await as('resubmitter');await db.query("UPDATE public.properties SET description='Corrected room layout description' WHERE id=$1",[resubmittedProperty]);
assert.equal((await db.query('SELECT public.resubmit_property_review($1) AS queue',[resubmittedProperty])).rows[0].queue,'listing');
await as('admin');await db.query('SELECT public.admin_publish_property($1)',[resubmittedProperty]);
await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'active');
assert.equal((await db.query('SELECT count(*)::int AS n FROM public.property_review_requests WHERE property_id=$1 AND resubmitted_at IS NOT NULL',[resubmittedProperty])).rows[0].n,3);
await db.exec(workflow);assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'active');
// Documents-only correction needs a genuinely new stored file, not detail edits.
await as('resubmitter');await db.query("UPDATE public.properties SET city_id='00000000-0000-0000-0000-000000000109' WHERE id=$1",[resubmittedProperty]);
await as('admin');
// A failed notification rolls back the entire rejection and its history.
await db.exec('RESET ROLE');await db.exec("ALTER TABLE public.notifications ADD CONSTRAINT fixture_notification_failure CHECK(title<>'Ownership submission rejected') NOT VALID");
await as('admin');await assert.rejects(db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5,$6)',[resubmittedProperty,'ownership','Replace illegible proof','documents','Upload a clear ownership document.',newDoc]),/fixture_notification_failure/);
assert.equal((await db.query('SELECT status FROM public.documents WHERE id=$1',[newDoc])).rows[0].status,'pending');
await db.exec('RESET ROLE');await db.exec('ALTER TABLE public.notifications DROP CONSTRAINT fixture_notification_failure');
await as('admin');await db.query('SELECT public.reject_property_review($1,$2,$3,$4,$5,$6)',[resubmittedProperty,'ownership','Replace illegible proof','documents','Upload a clear ownership document.',newDoc]);
await as('resubmitter');await assert.rejects(db.query('SELECT public.resubmit_property_review($1)',[resubmittedProperty]),/new ownership evidence/);
const finalPath=resubmittedProperty+'/clear-proof.pdf';await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('ownership-documents',$1)",[finalPath]);
await db.query("INSERT INTO public.documents(user_id,property_id,document_type,document_url) VALUES($1,$2,'ownership',$3)",[ids.resubmitter,resubmittedProperty,finalPath]);
assert.equal((await db.query('SELECT status FROM public.properties WHERE id=$1',[resubmittedProperty])).rows[0].status,'rejected');
assert.equal((await db.query('SELECT public.resubmit_property_review($1) AS queue',[resubmittedProperty])).rows[0].queue,'ownership');
await db.exec('RESET ROLE');
console.log('Explicit review workflow passed: structured rejection and notification, private history, unauthorized access blocked, draft details/media/uploads stay rejected, required changes enforced, ownership/publication routing, fresh approvals and repeatability.');

const diagnosticSql=fs.readFileSync('supabase/diagnostics/ownership-review-reset.sql','utf8').replace('f0aeee08-6dce-44ae-9e3c-f467dc6fb059',ids.reviewedProperty);
await db.exec('BEGIN READ ONLY');const diagnostic=JSON.parse((await db.query(diagnosticSql)).rows[0].ownership_review_diagnostic);await db.exec('ROLLBACK');
assert.equal(diagnostic.property.id,ids.reviewedProperty);assert.equal(diagnostic.actual_listing_seller.profile_id,ids.fresh);assert.ok(diagnostic.review_related_triggers.some(t=>t.function==='brick_private.evidence_resubmitted'));assert.ok(diagnostic.installed_review_routines.some(f=>f.function==='public.review_property_ownership'));
assert.ok(!JSON.stringify(diagnostic).includes('document_path'));assert.ok(!JSON.stringify(diagnostic).includes('document_url'));
console.log('Ownership-reset diagnostic query passed in a read-only transaction; status/trigger metadata only.');
await db.close();console.log('Owner-only database checks passed: protected roles/approvals, no agents/brokerage, owner and builder evidence, atomic reviews, legacy pause, public/private access, material/media re-review and revocation.');
