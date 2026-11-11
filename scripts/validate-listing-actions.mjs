import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),modules={};
function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>modules[name]||(name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name))});return exports;}
const {dashboardPropertyLink}=load('src/lib/dashboard-property-link.ts');
for(const status of ['pending','draft','rejected','suspended','approved']){
 const destination=dashboardPropertyLink({id:'own-property',slug:'example',status,verification_status:'approved'});
 assert.equal(destination.href,'/dashboard/edit/own-property');assert.equal(destination.published,false);
}
assert.equal(dashboardPropertyLink({id:'own-property',slug:'example',status:'active',verification_status:'approved'}).href,'/property/own-property/example');
for(const extra of [{slug:null},{verification_status:'ownership_submitted'}]){
 assert.equal(dashboardPropertyLink({id:'own-property',slug:'example',status:'active',verification_status:'approved',...extra}).href,'/dashboard/edit/own-property');
}
// Exercise the real async button handler with hook state and an isolated RPC.
let states=[],cursor=0,result={data:'2026-11-11T15:00:00Z',error:null},calls=[];
modules.react={useState(initial){const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}];}};
modules['@/lib/supabase/client']={createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return result;}})};
modules['./PropertyAvailability']={default:()=>null};
modules['@/lib/property-rental-details']=load('src/lib/property-rental-details.ts');
const Control=load('src/components/property/ListingAvailabilityControl.tsx').default;
const property={id:'own-property',availability_status:'unknown'};
function render(){cursor=0;return Control({property});}
function children(tree){return tree.props.children.flat(Infinity).filter(Boolean);}
let stopped=0;
await children(render()).find(child=>child.type==='button').props.onClick({stopPropagation(){stopped++;}});
assert.equal(stopped,1);assert.equal(calls[0].name,'confirm_property_availability');assert.equal(calls[0].args.p_property_id,property.id);
assert.equal(states[0].availability_status,'available');assert.equal(states[0].availability_confirmed_at,result.data);
assert.ok(children(render()).some(child=>child.props?.role==='status'&&child.props.children==='Availability confirmed successfully.'));
result={data:null,error:{message:'Confirmation denied'}};
await children(render()).find(child=>child.type==='button').props.onClick({stopPropagation(){stopped++;}});
assert.equal(stopped,2);assert.ok(children(render()).some(child=>child.props?.role==='alert'&&child.props.children==='Confirmation denied'));
assert.ok(!children(render()).some(child=>child.props?.role==='status'));
assert.equal(states[0].availability_confirmed_at,'2026-11-11T15:00:00Z');
const dashboard=fs.readFileSync('src/app/(dashboard)/dashboard/my-listings/page.tsx','utf8');
assert.ok(!dashboard.includes('router.push('));assert.ok(dashboard.includes('verification_status,'));
console.log('Listing actions passed: publication-aware links, pending edit destination, availability success/error, state retention and click propagation.');
