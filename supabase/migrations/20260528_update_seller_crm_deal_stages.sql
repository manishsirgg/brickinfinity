-- Normalize seller CRM deal stages and enforce allowed pipeline values

update public.seller_crm_deals set deal_stage = 'new_deal' where deal_stage = 'new';
update public.seller_crm_deals set deal_stage = 'token_advance_pending' where deal_stage = 'token_pending';
update public.seller_crm_deals set deal_stage = 'agreement_completed' where deal_stage = 'agreement_done';

alter table public.seller_crm_deals
  drop constraint if exists seller_crm_deals_deal_stage_check;

alter table public.seller_crm_deals
  add constraint seller_crm_deals_deal_stage_check
  check (deal_stage in (
    'new_deal',
    'qualified',
    'property_shared',
    'site_visit_scheduled',
    'site_visit_done',
    'negotiation',
    'token_advance_pending',
    'token_advance_received',
    'agreement_pending',
    'agreement_completed',
    'closed_won',
    'closed_lost'
  ));
