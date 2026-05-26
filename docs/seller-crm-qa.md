# Seller CRM QA Checklist

## API routes
- `/api/seller/crm/summary`
- `/api/seller/crm/contacts` and `/api/seller/crm/contacts/:id`
- `/api/seller/crm/deals` and `/api/seller/crm/deals/:id`
- `/api/seller/crm/followups` and `/api/seller/crm/followups/:id`
- `/api/seller/crm/activities`
- `/api/seller/crm/settings`

## Key actions
- Create/edit/archive/restore contact
- Create/edit deal and move stage to closed_won/closed_lost
- Create follow-up and complete/cancel/reschedule
- Check overview cards and activities timeline
- Save settings

## Security checks
- No client-provided seller_id accepted
- All queries scoped by seller_id
- No use of public.profiles/seller_profile_id

## Regression checks
- Property flows still load
- Featured listing/payment pages still build
- Admin pages still build
- Auth login flow still builds
