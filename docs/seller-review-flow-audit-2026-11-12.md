# Seller and property approval flow audit — 12 November 2026

**Result: the current repository implements the requested ordinary-seller flow. The complete lifecycle passed isolated PostgreSQL tests. Live database configuration remains unverified because its configured TCP connection was refused.**

Follow-up: the per-document KYC decision described in this historical audit is superseded by `20261112_consolidated_kyc_applications.sql`. Current KYC uses one complete application decision; see [the current rollout guide](owner-only-verification.md#consolidated-kyc-application-decisions-12-november).

Audited baseline: `origin/main` at `a06bda2`, including PRs #156–#158. This audit changes tests/documentation only, not application behavior or migrations.

| Stage | Implemented behavior | Evidence |
|---|---|---|
| Registration | New profiles are buyers with unsubmitted KYC/basic access. Registration does not grant seller/admin status. | `src/app/register/page.tsx`, database account guard, fresh authenticated registration test with distinct auth/profile UUIDs. |
| Seller application | Save owner/project-owning-builder declaration; upload government ID and selfie. Missing/partial evidence does not activate seller access. | Profile/declaration components, `identity_evidence_ready`, `review_identity_document`, identity application grouping. |
| KYC rejection | Rejected identity documents retain the admin reason; the account remains a buyer. Corrected identity uploads return to KYC for another review. | Profile reason display, identity upload/review guards, fresh rejection/reupload test. |
| KYC approval | Approved current government ID + matching selfie + saved owner declaration produce `seller / approved / active`. A separate Users-tab activation is not a normal registration step. | Checked identity/declaration routines; fresh lifecycle test never calls manual activation. |
| Property submission | Ordinary sellers must provide actual owner/project details, attestation and ownership proof. The property enters ownership review, not public search. | Add-property validation, owner/evidence guards, Ownership queue. |
| Ownership rejection | Admin supplies reason, correction category and required seller action. Notification and rejection are atomic. Draft saves/uploads stay rejected; explicit resubmission returns to ownership review. | Structured rejection/submission RPCs and seller notices; notification rollback/access/draft tests. |
| Ownership approval | Approved proof sets ownership approved while property remains pending. Publication is separate. | Checked ownership RPC; anonymous access remains denied after ownership approval. |
| Listing rejection | Admin gives reason and required corrections. Seller saves a draft and explicitly resubmits. Valid ownership returns to publication review; changed ownership/new proof returns to ownership review. | Listings rejection form, snapshot/file checks, queue routing tests. |
| Listing approval | Admin publication changes the property to active/approved. Anonymous public access is granted only after publication and current owner eligibility/review checks. | `admin_publish_property`, `brick_private.public_listing`, home/search/property route filters; anonymous visibility test. |

## What yesterday's changes did

- PR #156 repaired submissions stuck between rejected ownership and pending property state, and distinguished total pending properties from publication-ready properties.
- PR #157 then introduced explicit rejection correction requests. For rejected listings with such a request, saving changes does **not** submit them. **Resubmit for review** is the required transition. Earlier pending submissions remain pending. This deliberately supersedes automatic resubmission of edited rejected listings.
- PR #158 removes the legacy one-ownership-document-per-property rule while preserving non-ownership uniqueness and old evidence/review references. Multiple supporting files and new versions are retained as separate ownership rows.

None of these changes merges KYC, ownership approval and publication or grants ordinary sellers permission to publish themselves. Buyer/agent/unauthorized ownership/publication attempts are covered by existing guard tests. Builder declarations are limited to builders whose company owns the project; actual company/project ownership still needs the human property-evidence review.

## Important distinctions

1. **KYC decisions are per document within a grouped user application.** The admin reviews government ID and selfie; seller access activates when both are approved and the declaration is saved. Partial applications can appear while still missing a requirement. The dashboard KYC count currently counts pending documents, while the KYC tab groups applicants. Two documents do not mean two applications.
2. **Existing staff exception:** BrickInfinity admin-created listings can publish through the established administrative path. This is separate from the ordinary owner/builder flow and carries its administrative listing source. It is not available to ordinary registered users.
3. **Publication is not visibility in every category:** a published rental belongs in relevant rent/home results, a sale listing in relevant buy/home results. Availability/search filters can exclude rented, sold or unavailable inventory.
4. **Zero pending queues can be correct:** rejected listings awaiting seller corrections are deliberately outside the pending ownership/publication queues. Saving corrections alone leaves them there. They return after explicit successful resubmission.
5. **Source deployment does not apply SQL migrations.** The current owner-only, trigger-retirement, explicit submission and ownership-version migrations must also be installed in Supabase. Do not reapply older function definitions over the latest ones.

## Verification performed

- `node scripts/validate-owner-only.mjs --text-schema` and `node scripts/validate-owner-only.mjs`: existing security/review regressions plus a fresh account moving through buyer registration, KYC rejection/reupload/approval, automatic seller activation, property submission, ownership rejection/correction/resubmission/approval, editorial rejection/draft/resubmission and publication. Anonymous SELECT remains denied until publication. Storage in these tests is represented by isolated object metadata, not real binary uploads.
- Ownership queue, identity application, review UI, admin statistics, owner badges and listing action checks.
- Ownership-version constraint tests reproduce the duplicate-key error and validate constraint/index and enum/text variants, retained file/review references, uniqueness preservation and repeatability.
- Added `supabase/diagnostics/seller-review-flow-audit.sql`, a read-only aggregate diagnostic for live configuration/queue counts. It includes no names, account IDs, contact details or evidence paths and is tested inside a read-only transaction.

## Remaining live verification

The environment has `DATABASE_URL`, but the TCP connection was refused. No live query, migration, account activation or publication was performed. The screenshot alone cannot prove which function/trigger definitions are installed. Run the read-only diagnostic in Supabase SQL Editor to check installed review routines, old trigger retirement, document uniqueness, private buckets, RLS, draft queue exclusion and review invariants. All `critical_checks` should be true; queue counts may legitimately be zero. This diagnostic is **not a migration** and does not repair or change data.
