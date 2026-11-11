import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);const modules={};
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,process:{env:{}},console:{info(){},error(){}},require:n=>modules[n]||require(n)});return exports;}
modules['@/lib/property-description-policy']=load('src/lib/property-description-policy.ts');
const policy=load('src/lib/property-rental-details.ts');modules['@/lib/property-rental-details']=policy;
assert.equal(policy.rentalDetailsPayload({security_deposit:'0',brokerage_charge:'',availability_status:'available'},true).security_deposit,0);
assert.equal(policy.rentalDetailsPayload({brokerage_charge:''},true).brokerage_charge,0);
assert.throws(()=>policy.rentalDetailsPayload({security_deposit:'-1'},true),/non-negative/);
assert.throws(()=>policy.rentalDetailsPayload({availability_status:'available_from'},true),/date/);
assert.throws(()=>policy.rentalDetailsPayload({other_charges_note:'Call 9899601701'},true),/contact details/);
assert.equal(policy.needsAvailabilityConfirmation({availability_confirmed_at:new Date(Date.now()-31*86400000).toISOString()}),true);
assert.equal(policy.needsAvailabilityConfirmation({availability_confirmed_at:new Date().toISOString()}),false);
const Breakdown=load('src/components/property/RentalCostBreakdown.tsx').default;
const unknown=renderToStaticMarkup(React.createElement(Breakdown,{property:{monthly_rate:10000,security_deposit:0}}));
assert.ok(unknown.includes('Not disclosed'));assert.ok(unknown.includes('Known move-in subtotal'));assert.ok(unknown.includes('₹10,000'));
const full={monthly_rate:10000,security_deposit:20000,brokerage_charge:0,maintenance_charges:1000,parking_charge:500,other_monthly_charges:0,other_one_time_charges:1000};
const complete=renderToStaticMarkup(React.createElement(Breakdown,{property:full}));assert.ok(complete.includes('₹11,500'));assert.ok(complete.includes('₹32,500'));assert.ok(complete.includes('Estimated move-in payment'));
const short=renderToStaticMarkup(React.createElement(Breakdown,{property:{hourly_rate:500}}));assert.ok(!short.includes('Known move-in subtotal'));
console.log('Rental cost/availability model checks passed.');
if(process.argv.includes('--database')){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 const owner='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',admin='00000000-0000-0000-0000-000000000003',id='00000000-0000-0000-0000-000000000004';
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE TABLE public.users(id uuid,user_id uuid,role text);CREATE TABLE public.properties(id uuid PRIMARY KEY,seller_id uuid,deleted_at timestamptz,title text,description text,maintenance_charges numeric);INSERT INTO public.users VALUES('${owner}','${owner}','seller'),('${other}','${other}','seller'),('${admin}','${admin}','admin');INSERT INTO public.properties VALUES('${id}','${owner}',null,'Clean title','Clean description',null);ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261110_block_description_contact_details.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/20261111_rental_costs_availability.sql','utf8');await db.exec(migration);await db.exec(migration);
 let row=(await db.query('SELECT * FROM public.properties')).rows[0];assert.equal(row.availability_status,'unknown');assert.equal(row.security_deposit,null);assert.equal(row.availability_confirmed_at,null);
 await assert.rejects(db.query('UPDATE public.properties SET security_deposit=-1'),/negative/);
 await assert.rejects(db.query("UPDATE public.properties SET availability_status='available_from'"),/date/);
 await assert.rejects(db.query("UPDATE public.properties SET other_charges_note='Call 9899601701'"),/contact details/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT public.confirm_property_availability($1)',[id]),/permission denied/);
 await db.exec(`RESET ROLE; SET ROLE authenticated;SET request.jwt.claim.sub='${other}'`);await assert.rejects(db.query('SELECT public.confirm_property_availability($1)',[id]),/Only the owner/);
 await db.exec(`SET request.jwt.claim.sub='${owner}'`);await db.query('SELECT public.confirm_property_availability($1)',[id]);await db.exec('RESET ROLE');row=(await db.query('SELECT * FROM public.properties')).rows[0];assert.equal(row.availability_status,'available');assert.ok(row.availability_confirmed_at);
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${admin}'`);await db.query('SELECT public.confirm_property_availability($1)',[id]);await db.exec('RESET ROLE');
 await db.exec(`UPDATE public.properties SET availability_status='rented';SET ROLE authenticated;SET request.jwt.claim.sub='${admin}'`);await assert.rejects(db.query('SELECT public.confirm_property_availability($1)',[id]),/Only the owner/);
 await db.close();console.log('Database migration checks passed: legacy defaults, date/fee/contact validation, owner-only confirmation under RLS, closed listing protection, repeatability.');
}

for (const status of ["rented", "sold", "unavailable"]) {
 const apiClient={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:"active",availability_status:status,seller_id:"seller",deleted_at:null},error:null})})})})};
 modules["next/server"]={NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 modules["@/lib/supabase/service"]={createServiceClient:()=>apiClient};
 modules["@supabase/supabase-js"]={createClient:()=>apiClient};
 for(const path of ["src/app/api/leads/route.ts","src/app/api/leads/reveal/route.ts"]){
   const api=load(path);const response=await api.POST({json:async()=>({property_id:"p",name:"Test",phone:"9876543210",buyer_name:"Test",buyer_phone:"9876543210"})});
   assert.equal(response.status,400,`${path} must reject ${status}`);
 }
}
console.log("Closed-property enquiry and phone-reveal checks passed.");
