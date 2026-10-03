begin;
create table reminders(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),user_id text not null references users(id),case_id uuid references cases(id),title text not null check(length(title)<=200),body text not null default '',due_at timestamptz not null,repeat_frequency text not null default 'NONE' check(repeat_frequency in('NONE','DAILY','WEEKLY')),priority event_severity not null default 'MEDIUM',status text not null default 'ACTIVE' check(status in('ACTIVE','COMPLETED','CANCELLED')),created_by text not null references users(id),created_at timestamptz not null default now());
create index reminders_due on reminders(due_at) where status='ACTIVE';
alter table reminders enable row level security;
create policy own_reminders on reminders for all using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id() and (case_id is null or app.can_read_case(tenant_id,case_id))) with check(app.is_tenant_member(tenant_id) and user_id=app.current_user_id() and created_by=app.current_user_id() and (case_id is null or app.can_read_case(tenant_id,case_id)));
create table alert_settings(tenant_id uuid not null references tenants(id),user_id text not null references users(id),enabled_kinds text[] not null default array['DEADLINE','TASK','EVENT','AGENDA','CLIENT','LEAD','CONNECTOR','DOCUMENT'],quiet_start integer check(quiet_start between 0 and 23),quiet_end integer check(quiet_end between 0 and 23),primary key(tenant_id,user_id));
alter table alert_settings enable row level security;
create policy own_alert_settings on alert_settings for all using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id()) with check(app.is_tenant_member(tenant_id) and user_id=app.current_user_id());
alter table notifications add column case_id uuid references cases(id);
alter table notifications add column client_id uuid references clients(id);
alter table notifications add column kind text not null default 'EVENT';
alter table notifications add column source_url text;
create policy notification_evidence_scope on notifications as restrictive for all using((case_id is null or app.can_read_case(tenant_id,case_id)) and (client_id is null or app.can_read_client(tenant_id,client_id)) and (event_id is null or exists(select 1 from judicial_events e where e.id=event_id and e.tenant_id=notifications.tenant_id and app.can_read_case(e.tenant_id,e.case_id)))) with check((case_id is null or app.can_read_case(tenant_id,case_id)) and (client_id is null or app.can_read_client(tenant_id,client_id)));
create policy notification_read_state on notifications for update using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id()) with check(app.is_tenant_member(tenant_id) and user_id=app.current_user_id());
alter table agent_approvals drop constraint agent_approvals_action_check;
alter table agent_approvals add constraint agent_approvals_action_check check(action in('CREATE_TASK','DRAFT_COMMUNICATION','CREATE_DEADLINE','CREATE_REMINDER'));
grant select,insert,update,delete on reminders,alert_settings to monitor_runtime;
do $$begin if not exists(select 1 from pg_roles where rolname='monitor_scheduler') then create role monitor_scheduler login noinherit nosuperuser nobypassrls;end if;end$$;
grant usage on schema app to monitor_scheduler;
create or replace function app.alert_bucket(due timestamptz) returns text language sql stable as $$select case when due<=now() then 'OVERDUE' when due<=now()+interval '2 hours' then '2H' when due<=now()+interval '1 day' then '1D' else '7D' end$$;
create or replace function app.deliver_reminders() returns integer language plpgsql security definer set search_path=public,app as $$
declare m record; prefs record; h integer; delivered integer:=0; n integer;
begin
 if not pg_try_advisory_xact_lock(628476212) then return 0;end if;
 for m in select tenant_id,user_id,role_code from tenant_members where active loop
  perform set_config('request.jwt.claim.sub',m.user_id,true);
  select * into prefs from alert_settings where tenant_id=m.tenant_id and user_id=m.user_id;
  
  h:=extract(hour from now() at time zone 'America/Argentina/Buenos_Aires');
  if prefs.quiet_start is not null and prefs.quiet_end is not null and (case when prefs.quiet_start<prefs.quiet_end then h>=prefs.quiet_start and h<prefs.quiet_end else h>=prefs.quiet_start or h<prefs.quiet_end end) then continue;end if;
  insert into notifications(tenant_id,user_id,case_id,channel,priority,title,body,idempotency_key,kind,source_url,sent_at,created_by)
  select m.tenant_id,m.user_id,r.case_id,'DASHBOARD',r.priority,r.title,r.body,'reminder:'||r.id||':'||r.due_at::text,'REMINDER','/alertas',now(),r.created_by from reminders r where r.tenant_id=m.tenant_id and r.user_id=m.user_id and r.status='ACTIVE' and r.due_at<=now() and (r.case_id is null or app.can_read_case(r.tenant_id,r.case_id)) on conflict(tenant_id,user_id,idempotency_key) do nothing;
  get diagnostics n=row_count;delivered:=delivered+n;
  update reminders r set status=case when repeat_frequency='NONE' then 'COMPLETED' else 'ACTIVE' end,due_at=case repeat_frequency when 'DAILY' then due_at+(floor(extract(epoch from now()-due_at)/86400)+1)*interval '1 day' when 'WEEKLY' then due_at+(floor(extract(epoch from now()-due_at)/604800)+1)*interval '1 week' else due_at end where r.tenant_id=m.tenant_id and r.user_id=m.user_id and r.status='ACTIVE' and r.due_at<=now() and (r.case_id is null or app.can_read_case(r.tenant_id,r.case_id));
  insert into notifications(tenant_id,user_id,case_id,client_id,event_id,channel,priority,title,body,idempotency_key,kind,source_url,sent_at,created_by)
  select m.tenant_id,m.user_id,x.case_id,x.client_id,x.event_id,'DASHBOARD',x.priority,x.title,x.body,x.key,x.kind,x.url,now(),m.user_id from (
   select d.case_id,null::uuid client_id,null::uuid event_id,(case when d.due_at<=now()+interval '2 hours' then 'HIGH' else 'MEDIUM' end)::event_severity priority,
    (case when d.status in('POSSIBLE','DETECTED') then 'Plazo pendiente de confirmar: ' when d.due_at<now() then 'Vencimiento superado: ' else 'Próximo vencimiento: ' end)||d.title title,
    'Fecha registrada: '||to_char(d.due_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI')||'. Verificá la fecha y la fuente con el abogado responsable. No se calculó un plazo legal.' body,
    'deadline:'||d.id||':'||d.due_at::text||':'||app.alert_bucket(d.due_at) key,'DEADLINE' kind,'/tareas' url
    from deadlines d where d.tenant_id=m.tenant_id and d.status not in('COMPLETED','DISMISSED') and d.due_at between now()-interval '30 days' and now()+interval '7 days' and (d.case_id is null or app.can_read_case(d.tenant_id,d.case_id))
   union all select t.case_id,null,null,(case when t.due_at<now() then 'HIGH' else 'MEDIUM' end)::event_severity,'Tarea '||(case when t.due_at<now() then 'atrasada: ' else 'por vencer: ' end)||t.title,'Revisá la tarea y actualizá su estado.','task:'||t.id||':'||t.due_at::text||':'||app.alert_bucket(t.due_at),'TASK','/tareas' from tasks t where t.tenant_id=m.tenant_id and t.status not in('DONE','CANCELLED') and t.due_at between now()-interval '30 days' and now()+interval '1 day' and (t.responsible_user_id=m.user_id or t.created_by=m.user_id or m.role_code in('OWNER','ADMIN')) and (t.case_id is null or app.can_read_case(t.tenant_id,t.case_id))
   union all select e.case_id,null,e.id,e.severity,'Novedad importante: '||e.title,'Movimiento sin revisar. Abrí el original y confirmá si requiere una acción.','event:'||e.id,'EVENT','/novedades' from judicial_events e where e.tenant_id=m.tenant_id and e.review_status='UNREVIEWED' and e.severity in('HIGH','CRITICAL') and e.detected_at>now()-interval '30 days' and app.can_read_case(e.tenant_id,e.case_id)
   union all select a.case_id,null,null,'MEDIUM'::event_severity,'Agenda: '||a.title,'Actividad prevista para '||to_char(a.starts_at at time zone 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI'),'agenda:'||a.id||':'||a.starts_at::text,'AGENDA','/tareas' from calendar_events a where a.tenant_id=m.tenant_id and a.starts_at between now() and now()+interval '2 hours' and (a.responsible_user_id=m.user_id or a.created_by=m.user_id or m.role_code in('OWNER','ADMIN')) and (a.case_id is null or app.can_read_case(a.tenant_id,a.case_id))
   union all select null,c.id,null,'MEDIUM'::event_severity,'Retomar contacto: '||c.full_name,'El próximo contacto registrado ya venció.','client:'||c.id||':'||c.next_contact_at::text,'CLIENT','/clientes' from clients c where c.tenant_id=m.tenant_id and c.deleted_at is null and c.next_contact_at<=now() and app.can_read_client(c.tenant_id,c.id) and (c.responsible_user_id=m.user_id or c.created_by=m.user_id or m.role_code in('OWNER','ADMIN'))
   union all select null,null,null,'MEDIUM'::event_severity,'Seguimiento de consulta: '||l.full_name,coalesce(l.next_action,'Revisá el próximo paso con este potencial cliente.'),'lead:'||l.id||':'||l.next_action_at::text,'LEAD','/leads' from leads l where l.tenant_id=m.tenant_id and l.next_action_at<=now() and l.status not in('HIRED','NOT_HIRED','OUT_OF_SCOPE') and (l.responsible_user_id=m.user_id or l.created_by=m.user_id or m.role_code in('OWNER','ADMIN'))
   union all select null,null,null,'HIGH'::event_severity,'Revisar conexión: '||co.account_label,'La fuente está degradada o desconectada. Las novedades pueden estar incompletas.','connector:'||co.id||':'||co.updated_at::date,'CONNECTOR','/integraciones' from connectors co where co.tenant_id=m.tenant_id and co.status in('DEGRADED','DISCONNECTED') and m.role_code in('OWNER','ADMIN')
   union all select d.case_id,null,null,'MEDIUM'::event_severity,'Documento necesita revisión: '||d.name,'La indexación requiere OCR o falló. El original se conserva.','document:'||d.id||':'||k.status||':'||k.updated_at::date,'DOCUMENT','/documentos' from knowledge_documents k join documents d on d.id=k.document_id where d.tenant_id=m.tenant_id and d.deleted_at is null and k.status in('NEEDS_OCR','FAILED') and app.can_read_document(d.tenant_id,d.id)
  ) x where x.kind=any(coalesce(prefs.enabled_kinds,array['DEADLINE','TASK','EVENT','AGENDA','CLIENT','LEAD','CONNECTOR','DOCUMENT'])) on conflict(tenant_id,user_id,idempotency_key) do nothing;
  get diagnostics n=row_count;delivered:=delivered+n;
 end loop;
 return delivered;
end$$;
revoke all on function app.deliver_reminders() from public;
grant execute on function app.deliver_reminders() to monitor_scheduler;
commit;
