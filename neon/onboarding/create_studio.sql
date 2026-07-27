\set ON_ERROR_STOP on

-- Uso:
-- psql "$DATABASE_URL_UNPOOLED" \
--   -v owner_email='admin@estudio.com' \
--   -v studio_name='Estudio Jurídico' \
--   -f neon/onboarding/create_studio.sql
--
-- El usuario debe haberse registrado antes mediante Better Auth.

begin;

select id as owner_user_id
from public.users
where lower(email) = lower(:'owner_email')
limit 1
\gset

\if :{?owner_user_id}
\else
  \echo 'No existe un usuario Better Auth con owner_email.'
  \quit
\endif

insert into public.tenants (name, created_by)
values (:'studio_name', :'owner_user_id')
returning id as tenant_id
\gset

insert into public.tenant_members (
  tenant_id, user_id, role_code, created_by
)
values (
  :'tenant_id', :'owner_user_id', 'OWNER', :'owner_user_id'
);

insert into public.connectors (
  tenant_id, source, account_label, status, schedule, created_by
)
values
  (
    :'tenant_id', 'PJN', 'Gatti', 'CONNECTED',
    '0 * * * *', :'owner_user_id'
  ),
  (
    :'tenant_id', 'PJN', 'Mazzarini', 'CONNECTED',
    '0 * * * *', :'owner_user_id'
  );

commit;

\echo 'Copiar estos UUID a GitHub Actions Secrets:'
select
  t.id as monitor_tenant_id,
  c.account_label,
  c.id as pjn_connector_id
from public.tenants t
join public.connectors c on c.tenant_id = t.id
where t.id = :'tenant_id'
order by c.account_label;
