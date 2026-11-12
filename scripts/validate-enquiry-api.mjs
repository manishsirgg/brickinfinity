import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import ts from 'typescript';
const require=createRequire(import.meta.url);let hasUser=true,rpcError=null,duplicate=false,serviceFails=false,calls=[];
const client={auth:{getUser:async()=>({data:{user:hasUser?{id:'session-user'}:null}})},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='submit_property_enquiry'?{id:'enquiry-id',lead_id:'lead-id',seller_id:'actual-seller',property_title:'Property',duplicate}:{items:[],total:0},error:rpcError};}};
const chain={select(){return this},eq(){return this},limit(){return this},update(){return this},insert(){return this},single:async()=>({data:{id:'contact'}}),maybeSingle:async()=>({data:null}),then(resolve){return Promise.resolve({error:null}).then(resolve)}};
const modules={
 'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status||200})}},
 '@/lib/supabase/server':{createClient:async()=>client},
 '@/lib/supabase/service':{createServiceClient:()=>{if(serviceFails)throw Error('CRM not available');return {from:()=>chain}}},
};
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>modules[name]||require(name),URL,console:{info(){},error(){}}});return exports;}
const lead=load('src/app/api/leads/route.ts'),api=load('src/app/api/enquiries/route.ts'),reveal=load('src/app/api/leads/reveal/route.ts');
const input={property_id:'property',request_key:'request-key',name:'Buyer',phone:'919876543210',email:'BUYER@example.com',message:'Interested',seller_id:'forged-seller',visit_at:'2026-12-01T05:30:00Z'};
const request=(body=input,origin='https://brickinfinity.com',path='/api/leads')=>({url:'https://brickinfinity.com'+path,headers:{get:n=>n==='origin'?origin:null},json:async()=>body});
assert.equal((await lead.POST(request(input,'https://other.example'))).status,403);assert.equal(calls.length,0);
hasUser=false;assert.equal((await reveal.POST(request())).status,401);assert.equal((await reveal.POST(request({},'https://other.example'))).status,403);assert.equal((await lead.POST(request())).status,401);assert.equal((await api.GET(request())).status,401);assert.equal((await api.POST(request())).status,401);assert.equal(calls.length,0);
hasUser=true;assert.equal((await lead.POST(request({...input,name:{bad:true}}))).status,400);
let response=await lead.POST(request());assert.equal(response.status,200);assert.equal(response.data.enquiry_id,'enquiry-id');assert.equal(calls.at(-1).args.p_phone,'9876543210');assert.equal(calls.at(-1).args.p_email,'buyer@example.com');assert.equal(calls.at(-1).args.p_seller_id,undefined);
rpcError={code:'P0001',message:'Property no longer available'};response=await lead.POST(request());assert.equal(response.status,400);assert.equal(response.data.error,'Property no longer available');
rpcError=null;duplicate=true;response=await lead.POST(request());assert.equal(response.status,200);assert.equal(response.data.duplicate,true);
duplicate=false;serviceFails=true;response=await lead.POST(request());assert.equal(response.status,200);assert.equal(response.data.delivery,'inbox');assert.equal(response.data.crmSync,'failed');
response=await api.GET(request({},undefined,'/api/enquiries?view=seller&offset=20'));assert.equal(response.status,200);assert.equal(calls.at(-1).args.p_seller,true);assert.equal(calls.at(-1).args.p_offset,20);
await api.POST(request({id:'enquiry-id',action:'confirmed',note:'Meet there',buyer_id:'forged'}));assert.equal(calls.at(-1).name,'update_property_enquiry');assert.equal(calls.at(-1).args.p_buyer_id,undefined);
console.log('PASS: API authentication/origin, normalized contacts, server-derived identity, duplicate retries, validation and CRM failure preserving inbox success.');
