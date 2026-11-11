# Owner-only listing and verification rollout

Only actual property owners, builders whose company owns the project, and BrickInfinity staff admins may list. Agents, brokers, marketing representatives and contractors without ownership are not eligible. Documents require human review; these controls cannot establish legal title automatically.

## Deploying

Apply earlier repository migrations first, including rental costs/availability and the description policy. Then run the **entire** `supabase/migrations/20261111_owner_only_verification.sql` file as the database owner in Supabase SQL Editor. It runs in a transaction and can be rerun. Deploy the accompanying application changes together with this migration. Back up and preview against a staging copy first.

After that migration, also apply `supabase/migrations/20261111_owner_review_trigger_compatibility.sql`. Existing installations that already ran the owner-only migration only need this small follow-up. It fixes `relation "documents" does not exist` when older triggers use unqualified public table names during a review. It changes function search paths and removes schema creation rights from ordinary API users; it does not change review decisions, publish properties or pause additional inventory. Keep `public` a trusted schema, with built-ins first and temporary objects last. Legacy functions that explicitly set their own incorrect search path still require a separate function-specific repair after inspecting their database definition.

This migration deliberately pauses existing non-admin published listings without the new ownership review. It also pauses published listings with legacy nonzero brokerage, including admin listings. Owners must record their declaration, complete their ownership fields and submit evidence for re-review. Existing approved identity evidence can be reused only when the actual stored files exist. Do not automatically republish legacy listings or manufacture review timestamps. Admin listings receive a separate source label, without automatic ownership or identity badges.

Before applying, review the affected inventory and staff roster:

```sql
select role, kyc_status, seller_status, count(*) from public.users group by 1,2,3;
select id, full_name, user_id from public.users where role::text = 'admin';
select p.id, p.title, u.role, p.brokerage_charge
from public.properties p join public.users u on u.id = p.seller_id
where p.deleted_at is null and p.status::text = 'active'
  and (u.role::text <> 'admin' or coalesce(p.brokerage_charge, 0) <> 0);
select id, public from storage.buckets where id in ('identity-documents','ownership-documents');
select schemaname, tablename, policyname, cmd, roles from pg_policies
where schemaname in ('public','storage');
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef and n.nspname in ('public','brick_private');
```

Audit any additional live SECURITY DEFINER functions and service-role endpoints not present in this repository. They may bypass row policies and must not offer unreviewed role grants, publication or ownership approval. The repository tests cannot certify functions added separately in the live project. Keep service/database credentials server-side.

## Review workflow

1. The user records actual-owner or project-owning-builder capacity and accepts the no-agent declaration on Profile. Public admin-upgrade applications are removed.
2. Admins review one user application at a time in the KYC queue, with the latest government ID and matching selfie shown together. The on-page review note is used for each document's approval or rejection and is retained between decisions and after errors. Each pending document has its own decision/status; identity and seller activation are recomputed server-side after each decision and require the complete evidence set and declaration. Files must exist in private storage. Profile shows all three mandatory requirements and their current states; completing only one or two does not activate seller access.
3. Seller add/edit forms use the saved Profile owner category automatically, displaying it read-only with a Profile correction link. Personal legal names prefill from approved KYC; builder company names can reuse the account's previously approved ownership evidence. A personal KYC name is never guessed to be a company name. Existing listing legal names are retained unless the category changes; legal-name corrections require confirmation and ownership re-review. Builders enter the specific owned project for each listing. Property-specific ownership confirmation is required for new listings and ownership/location changes, but routine edits preserve it. Upload ownership evidence identifying the exact property/project and legal owner. Builders must show company ownership of the project; a brochure or marketing authorization is insufficient. Admins can enter owner details for their administrative listings.
4. The Ownership queue presents the identity/property evidence bundle with expiring signed links. Admins check identity match, property match, actual ownership and absence of an agent; builders additionally require company/project ownership. A review note is mandatory. Approval records the evidence paths, checklist, owner metadata, reviewer and timestamp.
5. An admin publishes after the ownership review. Staff-created listings follow a separate administrative path. Each public badge names the actual review performed; none guarantees clear legal title.

Material text/price/media changes return a listing to editorial review. Ownership/location changes also invalidate the ownership decision and reopen proof review. Availability reconfirmation and cover reordering alone do not require a new review. Revoking identity/seller access withdraws non-admin listings and clears their badges. Only an existing staff admin can grant/revoke staff access through the checked RPC; self-removal and removal of the last admin are blocked.

The admin Ownership audit page provides read-only ownership, account-security and listing-transition history. Evidence buckets are private; owners cannot overwrite/delete referenced reviewed evidence. Protect this retained personal data under the site's retention policy. Administrative deletion requires a separate controlled retention process.

## Validation and recovery

Run `node scripts/validate-owner-only.mjs` (isolated PostgreSQL via PGlite), `node scripts/validate-owner-badges.mjs`, existing property/search/rental checks, TypeScript and ESLint. Database tests exercise permissive legacy-policy bypass attempts, role escalation, private evidence access, owner/builder reviews, publication, revocation and repeat migration application. They do not modify production.

After deployment, check an ordinary owner, project-owning builder, staff admin and anonymous visitor against staging/production as appropriate. Verify private bucket flags, paused legacy inventory, signed previews and review queues. Use a backup or a reviewed forward repair if deployment fails; do not restore broad old approval privileges or bulk-publish paused records as a workaround.
