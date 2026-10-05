begin;
grant create on schema app to monitor_accounting;
insert into ai_profiles values('extraction_document',48000,7200,12,0,600);
alter table ai_work add column prepaid_remaining numeric not null default 0,add column prepaid boolean not null default false,add column prepaid_day date;
create policy accounting_work_metadata on ai_work for select to monitor_accounting using(true);
-- aggregate reservation, based on the bounded server-built units including one repair per unit.
create function app.prepare_extraction(wid uuid,inp integer,outp integer,calls_needed integer) returns boolean language plpgsql security definer set search_path=public,app as $$
declare w ai_work;p ai_profiles;n numeric;lim ai_limits;sid text;used numeric;d date:=(now() at time zone 'UTC')::date;
begin
 perform pg_advisory_xact_lock(2026100401);
 select * into w from ai_work where id=wid and user_id=app.current_user_id() for update;
 if not found or not app.is_tenant_member(w.tenant_id) or not app.can_read_document(w.tenant_id,w.document_id) or not app.can_read_case(w.tenant_id,w.case_id) then raise exception 'WORK_NOT_ACCESSIBLE';end if;
 if w.prepaid then if w.prepaid_day<>d then raise exception 'DOCUMENT_RESERVATION_EXPIRED';end if;return true;end if;
 select * into p from ai_profiles where name=w.profile;
 if w.profile<>'extraction_document' or inp<1 or outp<1 or calls_needed<1 or inp>p.input_limit or outp>p.output_limit or calls_needed>p.call_limit then raise exception 'DOCUMENT_BUDGET_EXCEEDED';end if;
 n:=(inp*4625::numeric+outp*30475::numeric)/1000000;
 for lim in select * from ai_limits order by scope loop
  sid:=case lim.scope when 'app' then 'app' when 'tenant' then w.tenant_id::text else w.user_id end;
  insert into ai_buckets(scope,scope_key,day) values(lim.scope,sid,d) on conflict do nothing;
  select neurons into used from ai_buckets where scope=lim.scope and scope_key=sid and day=d for update;
  if used+n>lim.neurons then raise exception 'DAILY_BUDGET_EXCEEDED';end if;
 end loop;
 update ai_buckets set neurons=neurons+n where day=d and ((scope='app' and scope_key='app') or (scope='actor' and scope_key=w.user_id) or (scope='tenant' and scope_key=w.tenant_id::text));
 update ai_work set prepaid=true,prepaid_remaining=n,prepaid_day=d where id=wid;
 return true;
end$$;
alter function app.prepare_extraction(uuid,integer,integer,integer) owner to monitor_accounting;
revoke all on function app.prepare_extraction(uuid,integer,integer,integer) from public;grant execute on function app.prepare_extraction(uuid,integer,integer,integer) to monitor_runtime;
-- Replace the reservation implementation, retaining function ownership/grants.
create or replace function app.reserve_ai_attempt(wid uuid,task_name text,provider_name text,model_name text,prompt_v text,tariff_v text,tariff_url text,inp integer,outp integer) returns uuid language plpgsql security definer set search_path=public,app as $$
declare w ai_work; p ai_profiles; n numeric; sid text; lim ai_limits; used numeric; result uuid; generation boolean; d date:=(now() at time zone 'UTC')::date;
begin
 if inp<1 or outp<0 then raise exception 'INVALID_RESERVATION';end if;
 perform pg_advisory_xact_lock(2026100401);
 select * into w from ai_work where id=wid and user_id=app.current_user_id() for update;
 if not found or not app.is_tenant_member(w.tenant_id) or (w.case_id is not null and not app.can_read_case(w.tenant_id,w.case_id)) or (w.document_id is not null and not app.can_read_document(w.tenant_id,w.document_id)) then raise exception 'WORK_NOT_ACCESSIBLE';end if;
 select * into p from ai_profiles where name=w.profile;
 generation:=model_name='@cf/qwen/qwen3-30b-a3b-fp8';
 if generation then n:=(inp*4625::numeric+outp*30475::numeric)/1000000;
 elsif model_name='@cf/baai/bge-m3' and outp=0 then n:=inp*1075::numeric/1000000;
 elsif model_name='@cf/baai/bge-reranker-base' and outp=0 then n:=inp*283::numeric/1000000;
 else raise exception 'UNPRICED_MODEL';end if;
 if provider_name<>'cloudflare' or (generation and (outp>p.per_call_output or w.input_reserved+inp>p.input_limit or w.output_reserved+outp>p.output_limit or w.calls>=p.call_limit)) or (not generation and w.input_reserved+inp>p.input_limit) then raise exception 'WORK_BUDGET_EXCEEDED';end if;
 if generation and task_name='classification' and (inp>1500 or outp>128 or exists(select 1 from ai_attempts where work_id=wid and task='classification')) then raise exception 'CLASSIFICATION_BUDGET_EXCEEDED';end if;
 if w.prepaid and w.prepaid_day<>d then raise exception 'DOCUMENT_RESERVATION_EXPIRED';end if;
 if w.prepaid and n>w.prepaid_remaining then raise exception 'DOCUMENT_BUDGET_EXCEEDED';end if;
 for lim in select * from ai_limits order by scope loop
  sid:=case lim.scope when 'app' then 'app' when 'tenant' then w.tenant_id::text else w.user_id end;
  insert into ai_buckets(scope,scope_key,day) values(lim.scope,sid,d) on conflict do nothing;
  select neurons into used from ai_buckets where scope=lim.scope and scope_key=sid and day=d for update;
  if not w.prepaid and used+n>lim.neurons then raise exception 'DAILY_BUDGET_EXCEEDED';end if;
  if generation and (select count(*) from ai_attempts a where a.model=model_name and a.status='RESERVED' and a.lease_until>now() and (lim.scope='app' or lim.scope='tenant' and a.tenant_id=w.tenant_id or lim.scope='actor' and a.user_id=w.user_id))>=lim.concurrency then raise exception 'AI_CONCURRENCY_LIMIT';end if;
 end loop;
 if generation and w.case_id is not null and exists(select 1 from ai_attempts a join ai_work aw on aw.id=a.work_id where aw.case_id=w.case_id and a.model=model_name and a.status='RESERVED' and a.lease_until>now()) then raise exception 'CASE_CONCURRENCY_LIMIT';end if;
 if not w.prepaid then update ai_buckets set neurons=neurons+n where day=d and ((scope='app' and scope_key='app') or (scope='actor' and scope_key=w.user_id) or (scope='tenant' and scope_key=w.tenant_id::text));end if;
 update ai_work set input_reserved=input_reserved+inp,output_reserved=output_reserved+outp,calls=calls+case when generation then 1 else 0 end,prepaid_remaining=case when prepaid then prepaid_remaining-n else 0 end where id=wid;
 insert into ai_attempts(work_id,tenant_id,user_id,task,profile,provider,model,prompt_version,tariff_version,tariff_source,input_reserved,output_reserved,neurons_reserved) values(wid,w.tenant_id,w.user_id,left(task_name,80),w.profile,provider_name,model_name,prompt_v,tariff_v,tariff_url,inp,outp,n) returning id into result;
 return result;
end$$;
create function app.release_extraction(wid uuid) returns void language plpgsql security definer set search_path=public,app as $$declare w ai_work;begin
 perform pg_advisory_xact_lock(2026100401);
 select * into w from ai_work where id=wid and user_id=app.current_user_id() for update;
 if not found or not app.can_read_document(w.tenant_id,w.document_id) then raise exception 'WORK_NOT_ACCESSIBLE';end if;
 update ai_buckets set neurons=greatest(0,neurons-w.prepaid_remaining) where day=w.prepaid_day and ((scope='app' and scope_key='app') or (scope='actor' and scope_key=w.user_id) or (scope='tenant' and scope_key=w.tenant_id::text));
 update ai_work set prepaid_remaining=0 where id=wid;
end$$;
alter function app.release_extraction(uuid) owner to monitor_accounting;
revoke all on function app.release_extraction(uuid) from public;grant execute on function app.release_extraction(uuid) to monitor_runtime;
create table extraction_units(tenant_id uuid not null,case_id uuid not null,document_id uuid not null,source_version integer not null,unit_key text not null,page integer not null,created_at timestamptz not null default now(),primary key(tenant_id,document_id,source_version,unit_key),foreign key(tenant_id,case_id) references cases(tenant_id,id),foreign key(tenant_id,document_id,source_version) references document_versions(tenant_id,document_id,version));
alter table extraction_units enable row level security;
create policy extraction_read on extraction_units for select using(app.can_read_document(tenant_id,document_id) and app.can_read_case(tenant_id,case_id));
create policy extraction_write on extraction_units for insert with check(app.can_write_tenant(tenant_id) and app.can_read_document(tenant_id,document_id) and app.can_read_case(tenant_id,case_id));
grant select,insert on extraction_units to monitor_runtime;
alter table knowledge_documents add column extraction_total integer not null default 0,add column extraction_covered integer not null default 0;
revoke create on schema app from monitor_accounting;
commit;
