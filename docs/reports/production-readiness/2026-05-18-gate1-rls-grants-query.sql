select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  coalesce(jsonb_agg(distinct jsonb_build_object('grantee', g.grantee, 'privilege', g.privilege_type)) filter (where g.grantee is not null), '[]'::jsonb) as anon_authenticated_grants,
  coalesce(jsonb_agg(distinct jsonb_build_object('policy', p.policyname, 'cmd', p.cmd, 'roles', p.roles)) filter (where p.policyname is not null), '[]'::jsonb) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join information_schema.role_table_grants g
  on g.table_schema = n.nspname
 and g.table_name = c.relname
 and g.grantee in ('anon', 'authenticated')
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    '_prisma_migrations','categories','ingestion_run','price_history','products',
    'promotion_products','promotions','source_health','staging_product',
    'supermarket_products','supermarkets'
  )
group by c.relname, c.relrowsecurity
order by c.relname;
