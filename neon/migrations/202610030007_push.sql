begin;
create table push_subscriptions(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),user_id text not null references users(id),endpoint text unique not null,subscription jsonb not null,created_at timestamptz not null default now());
alter table push_subscriptions enable row level security;
create policy own_push on push_subscriptions for all using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id()) with check(app.is_tenant_member(tenant_id) and user_id=app.current_user_id());
grant select,insert,update,delete on push_subscriptions to monitor_runtime;
alter table notifications add column push_sent_at timestamptz;
alter table notifications add column push_attempts integer not null default 0;
alter table notifications add column push_attempted_at timestamptz;
create or replace function app.pending_push() returns table(notification_id uuid,subscription_id uuid,subscription jsonb) language plpgsql security definer set search_path=public,app as $$
declare n record;
begin
 if not pg_try_advisory_xact_lock(628476213) then return;end if;
 for n in select a.* from notifications a where a.channel='DASHBOARD' and a.read_at is null and a.push_sent_at is null and a.push_attempts<4 and (a.push_attempted_at is null or a.push_attempted_at<now()-interval '15 minutes') and (a.snoozed_until is null or a.snoozed_until<=now()) and a.created_at>now()-interval '1 day' and exists(select 1 from tenant_members m where m.tenant_id=a.tenant_id and m.user_id=a.user_id and m.active) and exists(select 1 from push_subscriptions s where s.tenant_id=a.tenant_id and s.user_id=a.user_id) order by a.created_at limit 50 for update skip locked loop
  perform set_config('request.jwt.claim.sub',n.user_id,true);
  if exists(select 1 from alert_settings a where a.tenant_id=n.tenant_id and a.user_id=n.user_id and a.quiet_start is not null and a.quiet_end is not null and case when a.quiet_start<a.quiet_end then extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')>=a.quiet_start and extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')<a.quiet_end else extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')>=a.quiet_start or extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')<a.quiet_end end) then continue;end if;
  if n.case_id is not null and not app.can_read_case(n.tenant_id,n.case_id) then continue;end if;
  if n.client_id is not null and not app.can_read_client(n.tenant_id,n.client_id) then continue;end if;
  update notifications set push_attempts=push_attempts+1,push_attempted_at=now() where id=n.id;
  return query select n.id,s.id,s.subscription from push_subscriptions s where s.tenant_id=n.tenant_id and s.user_id=n.user_id;
 end loop;
end$$;
create function app.finish_push(notice uuid,success boolean,expired uuid[]) returns void language plpgsql security definer set search_path=public as $$begin
 update notifications set push_sent_at=case when success then now() else push_sent_at end where id=notice;
 delete from push_subscriptions s using notifications n where n.id=notice and n.tenant_id=s.tenant_id and n.user_id=s.user_id and s.id=any(expired);
end$$;
revoke all on function app.pending_push(),app.finish_push(uuid,boolean,uuid[]) from public;
grant execute on function app.pending_push(),app.finish_push(uuid,boolean,uuid[]) to monitor_scheduler;
commit;
