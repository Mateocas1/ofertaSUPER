-- Gate 1 Supabase/RLS remediation proposal for ofertasSUPER.
-- Date: 2026-05-18
-- Status: PROPOSED ONLY. Do not run without explicit approval.
-- Intent: current app access is server-side Prisma, not browser Supabase client.
-- This locks down PostgREST-facing anon/authenticated access and enables RLS.

begin;

revoke all on table public._prisma_migrations from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.ingestion_run from anon, authenticated;
revoke all on table public.price_history from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.promotion_products from anon, authenticated;
revoke all on table public.promotions from anon, authenticated;
revoke all on table public.source_health from anon, authenticated;
revoke all on table public.staging_product from anon, authenticated;
revoke all on table public.supermarket_products from anon, authenticated;
revoke all on table public.supermarkets from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

alter table public._prisma_migrations enable row level security;
alter table public.categories enable row level security;
alter table public.ingestion_run enable row level security;
alter table public.price_history enable row level security;
alter table public.products enable row level security;
alter table public.promotion_products enable row level security;
alter table public.promotions enable row level security;
alter table public.source_health enable row level security;
alter table public.staging_product enable row level security;
alter table public.supermarket_products enable row level security;
alter table public.supermarkets enable row level security;

commit;
