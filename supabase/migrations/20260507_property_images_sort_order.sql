alter table public.property_images
add column if not exists sort_order integer not null default 0;

with ranked as (
  select id, row_number() over (partition by property_id order by created_at asc, id asc) - 1 as rn
  from public.property_images
)
update public.property_images pi
set sort_order = ranked.rn
from ranked
where pi.id = ranked.id;
