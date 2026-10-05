begin;
-- User-authorized free allocation. Preserve accumulated usage and concurrency.
update ai_limits set neurons=10000 where scope in ('actor','tenant','app');
-- Return scalar usage only; never grant clients access to other actors' ledger.
create function app.daily_ai_usage(tid uuid) returns jsonb
language plpgsql security definer set search_path=public,app as $$
declare d date:=(now() at time zone 'UTC')::date; result jsonb;
begin
 if app.current_user_id() is null or not app.is_tenant_member(tid) then
  raise exception 'TENANT_NOT_ACCESSIBLE';
 end if;
 with totals as (
  select l.scope,l.neurons as cap,coalesce(b.neurons,0) as used
  from ai_limits l left join ai_buckets b on b.scope=l.scope and b.day=d
   and b.scope_key=case l.scope when 'app' then 'app' when 'tenant' then tid::text else app.current_user_id() end
 ) select jsonb_build_object(
  'limit',max(cap) filter(where scope='app'),
  'used',max(used) filter(where scope='app'),
  'actorUsed',max(used) filter(where scope='actor'),
  'remaining',greatest(0,min(cap-used)),
  'resetsAt',((d+1)::timestamp at time zone 'UTC'),
  'origin','APP_LEDGER'
 ) into result from totals;
 return result;
end $$;
alter function app.daily_ai_usage(uuid) owner to monitor_accounting;
revoke all on function app.daily_ai_usage(uuid) from public;
grant execute on function app.daily_ai_usage(uuid) to monitor_runtime;
commit;
