import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import ts from 'typescript';
const require=createRequire(import.meta.url),exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/document-retention/worker.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,require,Buffer,Date});
const {runDocumentRetention}=exports;
const orphan={bucket_id:'identity-documents',path:'unused.pdf',token:'claim-one',reason:'orphan_upload',sha256:null};
const history={...orphan,path:'history.pdf',reason:'reviewed_history_expired'};
function fixture(claims,fail={}){
 const calls=[];let failFinal=Boolean(fail.final),prepared=null;
 const db={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='claim_document_retention')return {data:claims,error:fail.claim?{message:'Claim failed'}:null};
  if(args.p_error)return {error:fail.audit?{message:'Audit unavailable'}:null};
  if(args.p_prepare){prepared=args.p_sha256;return {error:fail.prepare?{message:'Prepare failed'}:null};}
  if(failFinal){failFinal=false;return {error:{message:'Finalization unavailable'}};}
  return {error:null};
 },storage:{from:bucket=>({download:async path=>{calls.push({name:'download',bucket,path});return fail.download?{error:{message:'Unavailable'}}:{data:new Blob(['reviewed evidence']),error:null};},remove:async paths=>{calls.push({name:'remove',bucket,paths});return {error:fail.remove?{message:'Storage failure'}:null};}})}};
 return {db,calls,get prepared(){return prepared;}};
}
let test=fixture([orphan,history]);let result=await runDocumentRetention(test.db,20,'staff-auth-id');
assert.equal(result.deleted,2);assert.equal(result.deferred,0);assert.equal(result.failures.length,0);
assert.equal(test.calls[0].args.p_actor,'staff-auth-id');
assert.equal(test.prepared,createHash('sha256').update('reviewed evidence').digest('hex'));
const hashIndex=test.calls.findIndex(call=>call.args?.p_prepare),removeIndex=test.calls.findIndex(call=>call.name==='remove'&&call.paths[0]===history.path),finishIndex=test.calls.findIndex((call,index)=>index>removeIndex&&call.name==='finish_document_retention'&&!call.args.p_error);
assert.ok(hashIndex<removeIndex&&removeIndex<finishIndex);
for(const failure of ['download','prepare']){
 test=fixture([history],{[failure]:true});result=await runDocumentRetention(test.db);
 assert.equal(result.deleted,0);assert.equal(result.failures.length,1);assert.ok(!test.calls.some(call=>call.name==='remove'));assert.ok(test.calls.some(call=>call.args?.p_error));
}
test=fixture([orphan],{remove:true});result=await runDocumentRetention(test.db);assert.equal(result.deleted,0);assert.ok(test.calls.some(call=>call.args?.p_error==='Storage failure'));
test=fixture([orphan],{final:true});result=await runDocumentRetention(test.db);assert.equal(result.deleted,0);assert.equal(result.failures.length,1);result=await runDocumentRetention(test.db);assert.equal(result.deleted,1);
test=fixture([{...history,sha256:'a'.repeat(64)}]);await runDocumentRetention(test.db);assert.ok(!test.calls.some(call=>call.name==='download'));
test=fixture([{...history,sha256:'a'.repeat(64),object_missing:true}]);result=await runDocumentRetention(test.db);assert.equal(result.deleted,1);assert.ok(!test.calls.some(call=>['download','remove'].includes(call.name)));
test=fixture([{...history,object_missing:true}]);result=await runDocumentRetention(test.db);assert.equal(result.deleted,0);assert.ok(!test.calls.some(call=>call.name==='remove'));
test=fixture([]);result=await runDocumentRetention(test.db);assert.equal(result.deleted,0);assert.equal(result.claimed,0);
test=fixture([orphan],{claim:true});await assert.rejects(runDocumentRetention(test.db),/Claim failed/);assert.ok(!test.calls.some(call=>call.name==='remove'));
const cron=fs.readFileSync('src/app/api/cron/document-retention/route.ts','utf8');assert.ok(cron.includes('timingSafeEqual'));assert.ok(cron.includes('CRON_SECRET'));
const profile=fs.readFileSync('src/app/profile/page.tsx','utf8');assert.ok(!profile.includes('deleteImage("identity-documents"'));
console.log('Retention worker passed: Storage API only, checksum-before-delete, failure auditing, partial-failure retry, cached checksum recovery, empty runs and cron authentication configuration.');
