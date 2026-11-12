import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import ts from 'typescript';
const require=createRequire(import.meta.url),env={CRON_SECRET:'test-secret-for-isolated-auth-only'};
let hasUser=true,role='admin',serviceCalls=0,workerCalls=[],rpcCalls=[];
const modules={
 'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status||200})}},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:hasUser?{id:'staff-auth'}:null}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role}})})})})})},
 '@/lib/supabase/service':{createServiceClient:()=>{serviceCalls++;return {rpc:async(name,args)=>{rpcCalls.push({name,args});return {error:null};}};}},
 '@/lib/document-retention/worker':{runDocumentRetention:async(...args)=>{workerCalls.push(args);return {deleted:1};}},
};
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require:name=>modules[name]||require(name),Buffer,process:{env}});return exports;}
const cron=load('src/app/api/cron/document-retention/route.ts'),admin=load('src/app/api/admin/document-retention/route.ts');
const request=(input={},authorization='',origin='https://brickinfinity.com')=>({headers:{get:name=>name==='authorization'?authorization:name==='origin'?origin:null},nextUrl:{origin:'https://brickinfinity.com'},json:async()=>input});
assert.equal((await cron.GET(request())).status,401);assert.equal(serviceCalls,0);
assert.equal((await cron.GET(request({},'Bearer wrong-secret'))).status,401);assert.equal(serviceCalls,0);
assert.equal((await cron.GET(request({},`Bearer ${env.CRON_SECRET}`))).status,200);assert.equal(workerCalls.length,1);
delete env.CRON_SECRET;const prior=serviceCalls;assert.equal((await cron.GET(request())).status,503);assert.equal(serviceCalls,prior);
hasUser=false;assert.equal((await admin.POST(request({action:'run'}))).status,403);assert.equal((await admin.GET()).status,403);assert.equal(serviceCalls,prior);
hasUser=true;role='buyer';assert.equal((await admin.POST(request({action:'run'}))).status,403);assert.equal(serviceCalls,prior);
role='admin';assert.equal((await admin.POST(request({action:'run'},'','https://other.example'))).status,403);assert.equal(serviceCalls,prior);
assert.equal((await admin.POST(request({action:'run',actor:'forged'}))).status,200);assert.equal(workerCalls.at(-1)[2],'staff-auth');
assert.equal((await admin.POST(request({action:'policy',enabled:true,reviewedDays:0}))).status,400);assert.equal(rpcCalls.length,0);
assert.equal((await admin.POST(request({action:'policy',enabled:true,reviewedDays:null,actor:'forged'}))).status,200);assert.equal(rpcCalls.at(-1).args.p_actor,'staff-auth');
const release={action:'release',bucket:'identity-documents',path:'own/history.pdf',reason:'Case closed'};
let before=rpcCalls.length;assert.equal((await admin.POST(request(release))).status,400);assert.equal(rpcCalls.length,before);
assert.equal((await admin.POST(request({...release,confirmClosed:true}))).status,200);assert.equal(rpcCalls.at(-1).name,'manage_document_retention');assert.equal(rpcCalls.at(-1).args.p_actor,'staff-auth');
console.log('Retention API checks passed: cron secret, no unauthenticated cleanup, staff role/origin, server-derived actor, period validation and explicit case-closure release.');
