# Visit scheduling and enquiry delivery

## Existing system audit and strategy

Before this change, `/api/leads` saved a lead and then attempted CRM and notification writes separately. The response could claim success even when notification delivery failed. It also looked up the latest property lead after insert, which could attach a concurrent buyer's lead ID to CRM/notification metadata. Phone reveal had a separate lead creation path without the CRM and notification flow. The seller inbox discarded enquiries for inactive properties and counted only the current page. CRM already supports contact history, activities and visit-related deal stages, so a second CRM is unnecessary.

This change preserves leads and the existing CRM, adds participant-scoped tracking and visit states, and writes the lead, tracking record, event and notification in one database transaction. A notification failure rolls the request back; the user can safely retry with the same request key. The exact inserted lead ID is returned, rather than looking up the most recent lead. Both the enquiry form and phone reveal use this same submission flow. CRM sync remains a secondary integration: its failure never loses the delivered enquiry, and its state is visible to the seller. Existing CRM contact notes are no longer overwritten by an incoming enquiry; each enquiry is still logged as a separate note/activity.

No SMS, WhatsApp API or email delivery is claimed or configured. “Delivered” means saved in the seller's site inbox with an in-app notification. “Acknowledged” is an explicit seller action, rather than an email open or assumed page view. “Contacted” is also seller-recorded; a phone/WhatsApp click is not proof of a conversation. This avoids claiming delivery through providers that are not currently integrated.

## Flow

1. A signed-in buyer sends contact details, a message (up to 2,000 characters), and optionally a preferred visit time. Contact sharing is disclosed next to the submit button. A buyer remains a buyer; this does not change seller verification or any publication decisions.
2. The database checks the full public-listing approval rules and current availability, derives the seller and buyer IDs, saves the existing lead plus tracking record, and notifies the seller atomically. Own-property enquiries are blocked. Retried submissions are idempotent; edits use a fresh request key. A buyer can submit at most 10 enquiries per rolling 24 hours.
3. Buyer tracking is at `/enquiries` (account menu and property contact panel). Seller tracking is at `/enquiries?view=seller` (linked from the existing seller/admin lead inbox). Buyer tracking intentionally sits outside the seller-gated dashboard, so buyers can use it without KYC or seller activation.
4. Sellers acknowledge, mark contacted, or close enquiries. Both the new tracking inbox and old lead inbox use the same checked contacted routine. Historical enquiries stay visible when the property is paused or no longer publicly visible. Property snapshots prevent inaccessible/deleted listing joins from losing the enquiry context.
5. Visit requests are **not confirmed bookings**. Times are in IST, from 9 AM through 6 PM, at least one hour ahead and within 60 days. Confirmed visits reserve an hour; overlapping confirmed appointments for either participant are blocked, including across properties. Seller confirmation rechecks public availability. A seller can decline with a reason, either participant can cancel with a reason, and the buyer can request another time, which resets the visit to requested. A seller can mark a confirmed visit completed only once the appointment starts. An active visit must be cancelled/completed before its enquiry is closed. Closed enquiries are not reopened by changing a visit time; send a new enquiry instead.
6. Every status/time change has a timestamp, optional shared note, and an in-app notification to the other participant. Up to 100 updates per participant per rolling day are allowed. History is retained. List pages fetch 20 threads at a time, scoped by the authenticated participant; old enquiries are not matched to buyer accounts by a supplied phone/email.

Existing legacy leads remain accessible in the original inbox and CRM. They are not retroactively assigned to a buyer account based on unverified contact details. The tracked workflow starts with new submissions after deployment. Admins handle enquiries for their own admin-created listings through the same seller inbox; this does not grant arbitrary access to other participants' conversations.

## Deploy

1. Apply `supabase/migrations/20261112_visits_enquiry_tracking.sql` in Supabase SQL Editor **before deploying this code**. All previous owner-review, consolidated KYC and retention migrations must already be applied. Run the complete file, including `BEGIN` and `COMMIT`. It creates new tracking/event tables and checked routines, without changing property publication or account approval states. Do not rerun the baseline schema or earlier approval migrations.
2. Merge/deploy the application changes. Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY` are used. There is no new provider credential or cron job for this feature. Inbox delivery works transactionally via the signed-in Supabase client; CRM uses the existing service key.
3. As a buyer, request a visit on a public property owned by another user. Confirm the exact same enquiry appears in that seller's inbox and notification bell. As the seller, confirm it; as the buyer, check the confirmation and history in My enquiries & visits. Test a decline/reason and a new requested time. A request must not auto-confirm or publish a listing.
4. Pause a test listing and verify existing enquiries remain accessible, but a new request/confirmation is blocked. Confirm pending/rejected listings do not accept new enquiries.

Automatic appointment reminders, calendar-provider integration and external messaging are not part of this deployment. The history/notifications provide the foundation for adding those providers with a real delivery outbox and provider receipts later.

## Validation

- `node scripts/validate-visits-enquiries.mjs`: isolated PostgreSQL-compatible PGlite checks for transactional rollback, idempotent submissions, buyer/seller access, RLS permissions, transition rules, visit windows, conflicts, cancellation reasons, legacy contacted action, rate limits and retained histories.
- `node scripts/validate-enquiry-api.mjs`: isolated route checks for authentication/origin, contact normalization, server-derived identities, retry handling and CRM failure preserving successful inbox delivery.
- `npx tsc --noEmit` and ESLint on the changed typed components/routes.
- Browser component checks with mocked Supabase/API responses: scheduling form, IST conversion, request key, seller confirmation, buyer-only controls and mobile rendering. Real authenticated production delivery still needs the two-account check after migration/deployment; no live enquiry/notification was sent during development.
