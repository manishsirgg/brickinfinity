import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import ts from 'typescript';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);const modules={};function load(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>modules[name]||require(name)});return exports;}
const policy=load('src/lib/owner-verification.ts');modules['@/lib/owner-verification']=policy;const Badge=load('src/components/property/VerificationBadges.tsx').default;
assert.ok(policy.validateOwnerFields({owner_kind:'agent',owner_attested:true,owner_legal_name:'Agent'}));
assert.ok(policy.validateOwnerFields({owner_kind:'project_owner_builder',owner_legal_name:'Company',owner_attested:true}));
assert.equal(policy.validateOwnerFields({owner_kind:'project_owner_builder',owner_legal_name:'Company',owner_project_name:'Owned project',owner_attested:true}),null);
assert.ok(policy.validateOwnerFields({owner_kind:'owner',owner_legal_name:'Owner',owner_attested:false}));
const render=property=>renderToStaticMarkup(React.createElement(Badge,{property}));
const legacy=render({ownership_verified:true});assert.ok(!legacy.includes('Ownership documents reviewed'));assert.ok(legacy.includes('Owner verification pending'));
const admin=render({listing_source:'brickinfinity_admin',ownership_verified:true,listing_reviewed_at:'2026-11-11'});assert.ok(admin.includes('Listed by BrickInfinity'));assert.ok(admin.includes('Listing reviewed by BrickInfinity'));assert.ok(!admin.includes('Ownership documents reviewed'));
const owner=render({listing_source:'owner',ownership_review_status:'approved',ownership_reviewed_at:'2026-11-11',identity_reviewed_at:'2026-11-11',listing_reviewed_at:'2026-11-11'});assert.ok(owner.includes('Property owner'));assert.ok(owner.includes('Identity reviewed'));assert.ok(owner.includes('Ownership documents reviewed'));
const builder=render({listing_source:'project_owner_builder',ownership_review_status:'approved',ownership_reviewed_at:'2026-11-11'});assert.ok(builder.includes('Project-owning builder'));assert.ok(builder.includes('Builder/project documents reviewed'));
console.log('Owner identity and evidence-based badge checks passed.');
