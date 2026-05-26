# Seller CRM QA Checklist

## API routes
- ✅ `/api/seller/crm/summary`
- ✅ `/api/seller/crm/contacts` and `/api/seller/crm/contacts/:id`
- ✅ `/api/seller/crm/deals` and `/api/seller/crm/deals/:id`
- ✅ `/api/seller/crm/followups` and `/api/seller/crm/followups/:id`
- ✅ `/api/seller/crm/notes` and `/api/seller/crm/notes/:id`
- ✅ `/api/seller/crm/contact-options`
- ✅ `/api/seller/crm/property-options`
- ✅ `/api/seller/crm/activities`
- ✅ `/api/seller/crm/settings`

## Key actions
- ✅ Create/edit/archive/restore contact
- ✅ Mark contact converted/lost
- ✅ Create/edit deal and move stage to closed_won/closed_lost
- ✅ Create follow-up and complete/cancel/reschedule
- ✅ Add/edit/delete notes
- ✅ Check overview cards and activities timeline
- ✅ Save settings

## Manual testing steps
1. Notes: create note from contact and deal detail tabs, edit it, delete it, verify timeline item appears.
2. Options dropdowns: verify contact and property options endpoints return only seller-scoped records.
3. Restore: archive contact, then restore it, verify `is_archived` toggles and contact reappears.
4. Deal won/lost: update a deal stage to `closed_won` then `closed_lost` and verify stage-change activity.
5. Follow-up actions: create follow-up, complete, cancel, and reschedule with new due date.
6. Security direct URL checks: try accessing another seller's contact/deal/note/followup id directly; confirm not found/forbidden.

## Security checks
- No client-provided seller_id accepted
- All queries scoped by seller_id
- No use of public.profiles/seller_profile_id

## Regression checks
- Property flows still load
- Featured listing/payment pages still build
- Admin pages still build
- Auth login flow still builds
