import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/identity-review.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const base = { document_url: 'private-evidence', status: 'pending', created_at: '2026-11-11T10:00:00Z' };
const records = [
  { ...base, id: 'id-proof', user_id: 'same-user', document_type: 'aadhar' },
  { ...base, id: 'selfie', user_id: 'same-user', document_type: 'selfie' },
  { ...base, id: 'other', user_id: 'other-user', document_type: 'passport' },
];
const groups = exports.groupIdentityApplications(records);
assert.equal(groups.length, 2);
assert.equal(groups.find(group => group.user_id === 'same-user').documents.length, 2);
assert.equal(exports.groupIdentityApplications(records.slice(0, 2)).length, 1);
const replacement = { ...records[0], id: 'new-proof', status: 'approved', created_at: '2026-11-11T12:00:00Z' };
assert.equal(exports.latestIdentityDocuments([records[0], replacement])[0].id, 'new-proof');
assert.equal(exports.groupIdentityApplications([records[0], replacement]).length, 0);
assert.equal(exports.groupIdentityApplications([{ ...records[0], document_type: 'ownership' }]).length, 0);
assert.equal(exports.identityLabel('aadhar'), 'Aadhaar');
const profile={id:'same-user',seller_identity:'project_owner_builder',owner_declaration_at:'2026-11-12T10:00:00+00:00'};
const snapshot=exports.identityApplicationSnapshot(profile,records.slice(0,2));
assert.equal(snapshot.seller_identity,'project_owner_builder');assert.equal(snapshot.documents.length,2);
assert.equal(exports.identityCapacityLabel('project_owner_builder'),'Builder whose company owns the project');
assert.equal(exports.latestIdentityDocuments([records[0],{...records[0],id:'legacy-null-date',created_at:null}])[0].id,'id-proof');
const kycPage=fs.readFileSync('src/app/admin/kyc/page.tsx','utf8');
assert.ok(kycPage.includes('Approve application'));assert.ok(kycPage.includes('Reject and request resubmission'));assert.ok(kycPage.includes('identityCapacityLabel'));
assert.ok(!kycPage.includes('reviewDocument('));assert.ok(!kycPage.includes('rpc("review_identity_document"'));
console.log('Identity application grouping checks passed: same-user ID/selfie, separate users, latest evidence, superseded pending evidence and identity-only types.');
