# Seller CRM QA – Production Readiness Pass (2026-05-26)

## What was tested
- Code-level QA across CRM API routes and CRM UI page wiring.
- Local static checks: lint and production build.
- Manual browser QA was **not completed in this environment** (no authenticated interactive browser session).

## Passed checks
- Seller scoping is server-derived through `resolveSellerCrmContext` in all CRM routes.
- No `public.profiles`/`seller_profile_id` usage in CRM route tree.
- No API accepts trusted `seller_id` from client payloads for persistence.
- Deal close stage transitions now support `closed_at` persistence in PATCH allowlist.

## Bugs fixed
1. **CRM list pages had incomplete rendering paths**
   - Contacts/deals/follow-ups pages lacked robust loading/error/empty handling and basic seller-usable rendering.
   - Added explicit loading/error states and human-readable list rendering for all primary list pages.
2. **Detail page quick actions had safety gaps**
   - Added defensive unavailable states for missing call/email/WhatsApp actions.
   - Added Indian WhatsApp normalization for 10-digit local numbers (`91` prefix).
3. **Settings UX blockers**
   - Switched to controlled draft state + explicit save button (instead of onBlur-only writes).
   - Save button disables while request is in flight.
4. **Contact validation gaps**
   - Added readable invalid-email validation for create/update.
   - Added budget min/max validation for update path too.
   - Added duplicate error normalization for update path.
5. **Deal close metadata bug**
   - Added `closed_at` to deal PATCH allowlist so won/lost stage changes can persist close timestamp.

## What remains unverified here
- Full browser-authenticated interaction flows:
  - create/edit/archive/restore contact via actual forms
  - deal pipeline drag/stage movement UX
  - follow-up transition visual refresh in a live signed-in session
  - activity filter control UX behavior in browser
- Mobile viewport visual QA screenshots.

## Suggested production smoke test (post-deploy)
1. Log in as a seller and open all CRM pages:
   `/seller/crm`, `/contacts`, `/contacts/:id`, `/deals`, `/deals/:id`, `/followups`, `/activities`, `/settings`.
2. Execute one end-to-end contact journey:
   create → edit → archive → restore → convert/lost.
3. Execute one deal journey:
   create deal → move stage → mark won/lost and confirm `closed_at` reflected.
4. Execute follow-up transitions:
   create scheduled follow-up → complete → cancel → reschedule.
5. Create/edit/delete notes on both contact and deal detail pages.
6. Apply activity filters by `activity_type`, `channel`, `contact_id`, `deal_id`, `property_id` and confirm scoped results.
7. Save CRM settings and verify values persist on refresh.
