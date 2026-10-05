begin;

-- Gmail is a mail transport for MEV notices, not a session with the MEV portal.
create table public.gmail_mev_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  connector_id uuid not null unique references public.connectors(id) on delete cascade,
  mailbox_email text not null,
  refresh_token_encrypted text not null,
  granted_scope text not null,
  status text not null default 'CONNECTED' check (status in ('CONNECTED','DEGRADED','DISCONNECTED')),
  last_sync_at timestamptz,
  last_error_code text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_mev_mailbox_email check (mailbox_email = lower(mailbox_email))
);

alter table public.gmail_mev_connections enable row level security;
create policy gmail_mev_owner_read on public.gmail_mev_connections
  for select using (app.has_tenant_role(tenant_id, array['OWNER','ADMIN']));
create policy gmail_mev_owner_insert on public.gmail_mev_connections
  for insert with check (app.has_tenant_role(tenant_id, array['OWNER','ADMIN']));
create policy gmail_mev_owner_update on public.gmail_mev_connections
  for update using (app.has_tenant_role(tenant_id, array['OWNER','ADMIN']))
  with check (app.has_tenant_role(tenant_id, array['OWNER','ADMIN']));
create policy gmail_mev_owner_delete on public.gmail_mev_connections
  for delete using (app.has_tenant_role(tenant_id, array['OWNER','ADMIN']));

commit;
