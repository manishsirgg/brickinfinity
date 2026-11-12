# Document retention and storage cleanup

The system uploads separate evidence versions and retains review records. Cleanup removes eligible private file bytes through Supabase Storage API, preserving document/version rows, original decisions and deletion records. It does not replace reviewed files in place or concatenate files.

## Default policy

| Evidence | Handling |
|---|---|
| Current identity, pending submissions, evidence for an open property case, current approval basis or active correction/declaration evidence | Protected; cannot be released for cleanup |
| Upload with no document/version/review reference | Eligible after 48 hours |
| Known superseded, unreviewed file | Eligible after 7 days |
| Referenced files predating rollout, or historical files with uncertain review history | Preserved as legacy history |
| Previously reviewed history | Automatic expiry disabled by default |
| File on hold | Preserved |

Cleanup happens on the next eligible worker run, not immediately when an age threshold is reached. Current rejected identity evidence also stays protected while it is the current submission. Reviewed property evidence stays protected while its property case is open; archive/delete the property before closing and releasing its historical evidence. Property photos/videos and avatars are outside this policy.

Reviewed history needs both a configured period (30–3650 days) and an explicit release of that individual file after its case is closed. The release date starts the retention clock; it is not backdated to the old upload date. A reason and case-closure confirmation are required. Current/pending evidence cannot be released. If the historical evidence is needed for an ongoing dispute, place a hold instead. Removing a hold can make an already-aged file eligible on the next run. Cancel a release before reusing its path in any new submission.

The initial migration remembers pre-rollout referenced files so replacing a current pointer later cannot accidentally make old reviewed evidence look like an orphan. Rerunning the migration does not reset policy settings, retention clocks or that initial cutoff. Late references to pre-rollout files are also treated conservatively.

## Deployment

1. Apply the complete `supabase/migrations/20261112_document_retention.sql` after consolidated KYC and the owner-only/explicit-resubmission migrations. Installation creates policy/audit metadata, protects old references, and updates available-file review helpers. Installation itself deletes no file bytes and does not approve, publish or activate accounts.
2. Configure **server-only** environment variables in Vercel:
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase server service-role key used by `createServiceClient`; reuse it if already configured for this project.
   - `CRON_SECRET`: a strong random secret used to authorize the scheduled cleanup endpoint.
   Keep both in server environment settings; do not give them a `NEXT_PUBLIC_` prefix or commit their values.
3. Deploy the app. `vercel.json` configures `/api/cron/document-retention` daily at `0 3 * * *` UTC (08:30 IST). Vercel sends the cron authorization header using `CRON_SECRET`.
4. Open **Admin → Document retention**. Review eligible candidates and policy settings. Manual cleanup is available to logged-in staff through this page; scheduled cleanup requires the cron secret.

Reviewed-history expiry stays disabled until the business chooses a period. Configuring that period alone does not release files. Older referenced files are not automatically assumed disposable. No live migration or cleanup was run during implementation.

## Admin controls

- **Refresh preview:** lists up to 50 currently eligible files, with their reason and known size. It changes no files.
- **Allow cleanup claims:** pauses/resumes new cleanup claims and retries. Existing in-flight work can finish.
- **Run eligible cleanup:** processes up to 20 files per run; a runtime budget can defer remaining claims. Large backlogs can be processed in additional manual runs or by adjusting the schedule within deployment capacity.
- **Stored evidence files:** paginated inventory; current/pending protections and holds are shown. Select a file to manage it.
- **Place/remove hold:** requires an audited reason. A file already being deleted cannot acquire a new hold.
- **Schedule reviewed-history expiry:** choose the period first, confirm the case is closed, supply the reason and release a historical file. No immediate deletion occurs. Cancel scheduled expiry if the file becomes needed again.
- **Retry failed cleanup:** after investigating the failure, reset its retry budget with a reason. Files being actively deleted cannot be casually unheld or replaced.
- **Deletion records/audit:** retain original object ID/path/known size, reason, initiating actor, event times and—for reviewed files—a SHA-256 checksum recorded before deletion. Review decisions and version rows remain unchanged.

Owner-facing expiry status exposes only the deletion timestamp to authorized evidence owners/staff. Internal hold reasons and the full retention ledger remain staff-only. Evidence bundles label intentionally expired history as expired under policy rather than presenting it as unexplained missing evidence.

## Race protection and failure recovery

The server rechecks eligibility and freezes the exact path before making any Storage API deletion request. Evidence/version/review/declaration writes and Storage writes coordinate with the cleanup claim using database locks. New submissions cannot reference a released, claimed or deleted path; they must upload a new file. Current approval snapshots retain the files they rely on.

The worker prepares reviewed-file checksums, calls Storage API to remove bytes, then confirms the object is absent before recording deletion. It never SQL-deletes production Storage rows. Failed Storage calls do not receive successful deletion records. If a process stops after Storage removal, the persisted claim/checksum can finish the audit on a later run without downloading an already-deleted file.

Interrupted leases can resume after 10 minutes; reported failures back off for one hour. After five attempts, automatic retries stop so a permanently failing item cannot monopolize cleanup. Staff can investigate and explicitly retry. Unknown missing reviewed content without a prepared checksum requires investigation; the worker does not fabricate a checksum or success.

Later ownership reviews and correction snapshots include only available evidence, while earlier immutable reviews keep their original paths. Restoring an archived property whose approval evidence expired invalidates that ownership approval and requires fresh evidence/review. KYC re-verification, ownership rejection/resubmission and publication still work after historical expiry. Current identity and property files are not automatically expired when an unrelated version ages out.

## Verification

- `node scripts/validate-owner-only.mjs --text-schema`
- `node scripts/validate-owner-only.mjs`
- `node scripts/validate-document-retention-worker.mjs`
- `node scripts/validate-document-retention-api.mjs`
- TypeScript and targeted ESLint.

The PostgreSQL tests use an isolated PGlite fixture. They simulate Storage removal locally to verify the SQL state machine; the production worker uses Storage API exclusively. Tests cover grace windows, current/pending/legacy protection, holds, release clocks, checksum-before-delete, frozen references, private access, partial failure, retry limits, preserved audit records and restored-property/KYC workflows after expiry. Worker/API tests cover request authorization, server-derived actors, Storage failures and idempotent recovery. Production Storage integration still needs deployment verification with the configured server credentials.
