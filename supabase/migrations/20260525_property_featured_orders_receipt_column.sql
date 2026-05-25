alter table public.property_featured_orders
add column if not exists receipt text;

create index if not exists idx_property_featured_orders_receipt
on public.property_featured_orders(receipt);
