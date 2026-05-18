select
  object_schema,
  object_name,
  object_type,
  grantee,
  privilege_type
from information_schema.role_usage_grants
where object_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by object_name, grantee, privilege_type;
