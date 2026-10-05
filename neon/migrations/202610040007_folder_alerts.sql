begin;
-- Narrow, non-owner role. Membership metadata locates recipients; all case data reads still apply RLS.
grant select on tenant_members,cases,case_checklists,users,alert_settings to monitor_accounting;
grant insert on notifications to monitor_accounting;
create policy accounting_member_metadata on tenant_members for select to monitor_accounting using(true);
grant create on schema app to monitor_accounting;
create function app.deliver_folder_alerts() returns integer language plpgsql security definer set search_path=public,app as $$
declare m record;prefs alert_settings;h integer;total integer:=0;n integer;begin
 if not pg_try_advisory_xact_lock(2026100403) then return 0;end if;
 for m in select tenant_id,user_id from tenant_members where active and role_code<>'READ_ONLY' loop
  perform set_config('request.jwt.claim.sub',m.user_id,true);
  select * into prefs from alert_settings where tenant_id=m.tenant_id and user_id=m.user_id;
  if not ('DOCUMENT'=any(coalesce(prefs.enabled_kinds,array['DOCUMENT']))) then continue;end if;
  h:=extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  if prefs.quiet_start is not null and prefs.quiet_end is not null and (case when prefs.quiet_start<prefs.quiet_end then h>=prefs.quiet_start and h<prefs.quiet_end else h>=prefs.quiet_start or h<prefs.quiet_end end) then continue;end if;
  insert into notifications(tenant_id,user_id,case_id,channel,priority,title,body,idempotency_key,kind,source_url,sent_at,created_by)
  select m.tenant_id,m.user_id,i.case_id,'DASHBOARD',case when i.due_at<now() then 'HIGH'::event_severity else 'MEDIUM'::event_severity end,'Documentación pendiente: '||i.label,
   'Regla: pedido '||i.status||'. Fecha de gestión: '||coalesce(i.due_at::text,'sin fecha')||'. Responsable: '||coalesce(i.responsible_user_id,'sin asignar')||'. Dependencia: '||coalesce(i.depends_on::text,'ninguna')||'. Actualizado: '||i.updated_at::text||'. No es un plazo procesal.',
   'folder-document:'||i.id||':'||i.updated_at::text||':'||case when i.due_at is null then 'PENDING' else app.alert_bucket(i.due_at) end,'DOCUMENT','/causas/'||i.case_id,now(),m.user_id
  from case_checklists i where i.tenant_id=m.tenant_id and i.status in('PENDING','REQUESTED') and app.can_read_case(i.tenant_id,i.case_id)
  and (i.responsible_user_id is null or i.responsible_user_id=m.user_id) order by i.updated_at limit 100 on conflict do nothing;
  get diagnostics n=row_count;total:=total+n;
  insert into notifications(tenant_id,user_id,case_id,channel,priority,title,body,idempotency_key,kind,source_url,sent_at,created_by)
  select m.tenant_id,m.user_id,c.id,'DASHBOARD','MEDIUM','Revisar próxima acción: '||c.title,'Regla: ficha de causa activa sin actualizar por 14 días. Última actualización: '||c.updated_at::text||'. Verificar actividad no registrada en la ficha.',
  'folder-case:'||c.id||':'||c.updated_at::text,'DOCUMENT','/causas/'||c.id,now(),m.user_id
  from cases c where c.tenant_id=m.tenant_id and c.status='ACTIVE' and c.deleted_at is null and c.updated_at<now()-interval '14 days' and app.can_read_case(c.tenant_id,c.id) order by c.updated_at limit 10 on conflict do nothing;
  get diagnostics n=row_count;total:=total+n;
 end loop;return total;
end$$;
alter function app.deliver_folder_alerts() owner to monitor_accounting;
revoke all on function app.deliver_folder_alerts() from public;grant execute on function app.deliver_folder_alerts() to monitor_scheduler;
revoke create on schema app from monitor_accounting;
commit;
