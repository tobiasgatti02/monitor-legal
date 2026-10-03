begin;
create table team_invitations(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),email text not null,role_code text not null check(role_code in('ADMIN','LAWYER','ASSISTANT','READ_ONLY')),token_hash text unique not null,expires_at timestamptz not null default now()+interval '7 days',used_at timestamptz,created_by text not null references users(id),created_at timestamptz not null default now());
alter table team_invitations enable row level security;
create policy invitation_admin on team_invitations for all using(app.has_tenant_role(tenant_id,array['OWNER','ADMIN'])) with check(app.has_tenant_role(tenant_id,array['OWNER','ADMIN']));
grant select,insert,update,delete on team_invitations to monitor_runtime;
commit;
