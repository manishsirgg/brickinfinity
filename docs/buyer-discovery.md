# Saved searches, matching alerts, buyer activity and comparison

## Existing-system audit

The site already had structured property filters, keyword/location aliases, favourites, public view counts, property cards, in-app notifications and the enquiry/visit tracking added in PR #162. There was no per-buyer viewing history, comparison or saved-search matcher. The existing featured-payment email helper logs an email outcome but does not call a delivery provider; it is not used as proof of delivery for this feature.

This implementation reuses favourites, the existing enquiry/visit records, public property cards and notification schema. It adds private viewing history, saved-search records/match receipts and a durable Resend email queue. It does not change buyer/seller roles, KYC, ownership decisions or publication decisions. Existing anonymous enquiries from before the tracked workflow are not attached to a buyer account using unverified phone/email matches.

## Product behaviour

### Saved searches

Apply the existing filters on `/properties`, then choose **Save this search & get matching alerts**. The saved search captures the applied results filters, not unsaved edits in the sidebar. You can supply a name. Pagination/sort are excluded from matching. Names/aliases and location IDs are resolved on the server; price/area/room ranges and amenity values are validated. All selected amenities must match, numeric bounds are inclusive, and area means built-up square feet. Price uses the same advertised `price` field as the existing search filters; rental periods must still be checked on each listing.

For example: Commercial + Rent + Chhatarpur + maximum price 25000 + minimum area 1000. Use structured city/type filters for precise matching; free-text follows the existing broad OR alias/location search semantics. Saving a duplicate criterion keeps the existing search and its preferences, rather than creating another alert subscription. There are at most 20 saved searches per account.

New listing changes are queued by a database trigger. Daily processing checks the current full public-listing guard, availability and the search criteria before creating an in-app notification and a match receipt in one transaction. An unpublished/rejected/deleted/unavailable property cannot become a public matching card. A price/area/location change can make a listing qualify later. View-count updates do not queue search alerts. One match per search/property prevents repeated re-publication, edits or repeated cron runs from spamming the same subscription. Creating/resuming a search starts with future listing changes, without an initial flood of existing listings or a paused-period backlog. No self-listing alerts are generated.

Manage searches at `/buyer?tab=searches`: run, pause, resume, delete, or explicitly opt into/out of email. The latest 30 matching alerts and their current public availability are shown there. Pausing or opting out cancels queued unsent email; a provider request already in flight may finish. Deleting a search removes its match/email queue records. In-app notifications already delivered remain in the notification history. WhatsApp matching alerts are disabled; no WhatsApp consent is assumed or inferred from a profile phone number.

### Email delivery

Email is optional and unchecked initially. It goes only to `auth.users.email` with a non-null email confirmation timestamp, never to a browser-supplied or editable profile email. In-app matching works when email is unconfigured. Existing in-app matches are not emailed retroactively when someone opts in later.

A service-only worker claims email rows with a lease, rechecks active search consent, the listing and verified recipient, and freezes the recipient, sender, subject and text. Requests to Resend use a stable per-match idempotency key, so a network timeout can be retried with identical parameters. Definite provider rejections fail; rate limits/server/network ambiguity are deferred. Claims expire in 10 minutes. A stale worker cannot overwrite a reclaimed result.

Retries are limited to three attempts and a **23-hour window from the first attempt**, inside Resend's idempotency retention window. Older ambiguous attempts stop with an unconfirmed status rather than risk sending a duplicate after the provider forgets the key. Queued alerts expire after 7 days. An account receives at most 10 newly attempted matching emails per rolling 24 hours. A verified email change cancels a queued retry to the old address. Provider acceptance is shown as **Accepted by email provider**, not proof of delivery/opening; bounce/open webhooks are not implemented here.

The cron runs once daily at **8:45 AM IST** (`15 3 * * *` UTC), after the existing document-retention job. Each bounded run drains up to 100 property changes and up to 20 emails, subject to the execution time budget. **Admin → Search alerts** displays the backlog, provider/cron configuration and accepted/failed counts, and can run processing again. A transient email failure near a daily run may need a manual run after the 15-minute backoff to retry inside the safety window. For higher volumes, increase the schedule frequency on a Vercel plan that supports it or run the authenticated worker from an appropriate scheduler; monitor backlog rather than assuming every email has been sent. All processing is idempotent.

### Buyer dashboard

`/buyer` is available to signed-in buyers without seller activation/KYC. It provides:

- **Saved:** the existing favourites, with removal and comparison. Old saved-property URLs redirect to this tab.
- **Recently viewed:** up to 100 distinct public properties seen while signed in, within 90 days. Recording happens after the browser displays a detail page, not from server prefetch. Client deduplication is per signed-in account/property for 30 minutes. Clear-history is private and does not affect public view counts. Rows are physically capped during recording and expired by daily processing.
- **Contacted:** properties with the account's tracked enquiries/contact reveals. It does not imply a seller response.
- **Visit requested:** properties with visit requests, including the current confirmed/cancelled/etc. status, linked to full enquiry history.
- **Saved searches & alerts:** preferences and recent matches.

Activity APIs derive the profile from the verified session and expose no cross-user history. Unavailable listings show an unavailable placeholder, without a broken public link or leaking new private edits. Existing public verification badges and view counts are retained on public cards.

### Compare

Use **Compare** on public listing cards or property details. A browser-local shortlist stores only up to three property IDs and works for guests too. The global tray opens `/compare?ids=...`; the URL can also be shared. Remove columns from the comparison or clear the shortlist.

The server enforces three IDs and the full public-listing guard. It returns only whitelisted public fields. Comparison includes price, built-up area, price per sqft, locality/city, amenities, furnishing, refundable deposit and availability. Hourly/daily/monthly periods remain explicit; legacy rent with no disclosed period is labelled accordingly. Unknown values are **Not disclosed**; a known zero deposit is **₹0**, and zero/missing area never produces invalid division. Private/withdrawn selections are excluded even for a seller who can otherwise access their own drafts.

## Deploy and configure Resend

1. PR #162's visit/enquiry migration and earlier migrations must already be applied. Run **`supabase/migrations/20261114_buyer_discovery.sql`** once in Supabase SQL Editor, before deploying the new code. It follows the earlier visit/enquiry migration. Run the whole file, including BEGIN/COMMIT. It does not approve/publish any listing or change account status.
2. In Resend, add the sending domain you want to use, for example `brickinfinity.com` or a sending subdomain. Add the DNS records Resend supplies at your DNS provider, and wait until the domain is verified.
3. Create a Resend API key with sending access for that domain. In **Vercel → brickinfinity → Settings → Environment Variables**, add server-only **`RESEND_API_KEY`** as a sensitive Production variable. Do not put its value in chat or a `NEXT_PUBLIC_` variable.
4. Add **`ALERT_EMAIL_FROM`**, for example `BrickInfinity <alerts@brickinfinity.com>`, using your verified Resend sending domain. If you verified a subdomain, use an address on that subdomain instead.
5. Keep the existing **`SUPABASE_SERVICE_ROLE_KEY`** and **`CRON_SECRET`**. No new cron secret is needed. This PR's `vercel.json` adds the matching-alert schedule alongside document cleanup. Production scheduling starts after deployment; preview deployments do not receive the production cron schedule.
6. Merge/deploy after saving the variables. Email opt-in controls become available when the two Resend variables exist; **Admin → Search alerts** reports configuration and queue status. Configuration presence does not prove the API key/domain works: check provider acceptance after an opted-in test.

Deploying without Resend configured still supports saved searches, in-app matching, buyer history and comparison; email controls clearly state that delivery is not configured. No live email/notification was sent during development.

## Acceptance check

Use two accounts and a test listing. As the buyer, save an exact search and explicitly opt into email. As the seller/admin, publish a newly matching listing through the normal ownership/editorial review flow. Run **Admin → Search alerts → Process matching alerts now**, then verify one notification/match and provider acceptance in Resend. A second run must not duplicate it. Test nonmatching budget/area, email opt-out, pause/resume, and taking the listing offline before processing. Pending listings must not alert or appear in comparison.

Open a public detail page while signed in and check Recently viewed; save it and send an enquiry/visit request, then check all relevant dashboard tabs. Clear viewing history and confirm favourites/enquiries are untouched. Compare three listings with different rental periods; adding a fourth must fail visibly, and unknown deposit/area must remain undisclosed.

## Automated checks

- `node scripts/validate-buyer-discovery.mjs`: isolated PGlite matching, publication/availability guards, duplicate receipts, notification rollback, participant privacy, history limits/expiry, favourites, activity categories, comparison bounds, verified email consent and leased immutable retries.
- `node scripts/validate-buyer-search.mjs`: canonical filters, aliases, ranges, locations, comparison storage limits and price/area/period handling.
- `node scripts/validate-buyer-api.mjs`: session/origin checks, derived user identity, email configuration/consent, staff operations and cron authentication.
- `node scripts/validate-search-email-worker.mjs`: mocked Resend acceptance, idempotency, frozen payload, provider/network errors and bounded runs. No actual provider request.
- Browser component checks with mocked APIs cover saving/consent, comparison limits/persistence, unavailable cards, badges, preferences, private view recording and mobile rendering. Real production delivery needs the acceptance check above.
