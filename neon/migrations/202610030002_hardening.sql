begin;
create or replace function app.can_read_client(t uuid, client uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select app.is_tenant_member(t) and exists(select 1 from clients cl where cl.tenant_id=t and cl.id=client and cl.deleted_at is null and
 (app.has_tenant_role(t,array['OWNER','ADMIN']) or cl.responsible_user_id=app.current_user_id() or cl.created_by=app.current_user_id()
 or exists(select 1 from cases c where c.tenant_id=t and c.client_id=client and app.can_read_case(t,c.id))));
$$;
create policy client_scope on clients as restrictive for all using(app.can_read_client(tenant_id,id))
with check(app.is_tenant_member(tenant_id));
create policy client_scope on client_contacts as restrictive for all using(app.can_read_client(tenant_id,client_id)) with check(app.can_read_client(tenant_id,client_id));
create policy client_scope on client_portal_access as restrictive for all using(app.can_read_client(tenant_id,client_id)) with check(app.can_read_client(tenant_id,client_id));
create policy payment_scope on payments as restrictive for all using(exists(select 1 from fees f where f.id=fee_id and f.tenant_id=payments.tenant_id)) with check(exists(select 1 from fees f where f.id=fee_id and f.tenant_id=payments.tenant_id));
create policy event_scope on event_reviews as restrictive for all using(exists(select 1 from judicial_events e where e.id=event_id and e.tenant_id=event_reviews.tenant_id)) with check(exists(select 1 from judicial_events e where e.id=event_id and e.tenant_id=event_reviews.tenant_id));
create policy task_scope on task_checklist_items as restrictive for all using(exists(select 1 from tasks t where t.id=task_id and t.tenant_id=task_checklist_items.tenant_id)) with check(exists(select 1 from tasks t where t.id=task_id and t.tenant_id=task_checklist_items.tenant_id));
create policy communication_scope on communication_approvals as restrictive for all using(exists(select 1 from communications c where c.id=communication_id and c.tenant_id=communication_approvals.tenant_id)) with check(exists(select 1 from communications c where c.id=communication_id and c.tenant_id=communication_approvals.tenant_id));
-- Membership changes belong to tenant administrators; ordinary lawyers cannot grant access.
create policy assignment_admin on case_assignments as restrictive for insert with check(app.has_tenant_role(tenant_id,array['OWNER','ADMIN']));
create policy assignment_admin_update on case_assignments as restrictive for update using(app.has_tenant_role(tenant_id,array['OWNER','ADMIN'])) with check(app.has_tenant_role(tenant_id,array['OWNER','ADMIN']));
-- Optional-auth schema compatibility for versions already deployed.
alter table "twoFactor" add column if not exists "failedVerificationCount" integer default 0;
alter table "twoFactor" add column if not exists "lockedUntil" timestamptz;
create table if not exists bootstrap_claim(id text primary key,created_at timestamptz not null default now());
alter table bootstrap_claim enable row level security;
revoke all on bootstrap_claim from monitor_runtime;
grant monitor_runtime to neondb_owner;
commit;
