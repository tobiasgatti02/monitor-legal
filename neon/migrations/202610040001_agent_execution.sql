begin;
-- Additive. Runtime and the narrow accounting role both enforce RLS.
do $$begin if not exists(select 1 from pg_roles where rolname='monitor_accounting') then create role monitor_accounting nologin nosuperuser nobypassrls;end if;end$$;
grant create on schema app to monitor_accounting;
grant usage on schema public,app to monitor_accounting;
grant execute on all functions in schema app to monitor_accounting;
grant monitor_accounting to neondb_owner;
create table ai_profiles(name text primary key,input_limit integer not null,output_limit integer not null,call_limit integer not null,tool_limit integer not null,per_call_output integer not null);
insert into ai_profiles values ('classification',1500,128,1,0,128),('brief',6000,600,1,2,600),('document',12000,1200,2,4,600),('extraction',8000,1200,2,0,600),('draft',48000,6000,6,8,1200),('research',24000,2400,4,8,600),('ingestion',1000000,0,0,0,0);
-- Server/migration administered, no client may change quotas. UTC aligns with provider day.
create table ai_limits(scope text primary key,neurons numeric not null check(neurons>0),concurrency integer not null check(concurrency>0));
insert into ai_limits values('actor',500,1),('tenant',2500,2),('app',5000,2);
create table ai_work(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),user_id text not null references users(id),case_id uuid references cases(id),document_id uuid references documents(id),profile text not null references ai_profiles(name),input_reserved integer not null default 0,output_reserved integer not null default 0,calls integer not null default 0,tools integer not null default 0,created_at timestamptz not null default now());
create table ai_attempts(id uuid primary key default gen_random_uuid(),work_id uuid not null references ai_work(id),tenant_id uuid not null references tenants(id),user_id text not null references users(id),task text not null,profile text not null,provider text not null,model text not null,prompt_version text not null,tariff_version text not null,tariff_source text not null,input_reserved integer not null,output_reserved integer not null,input_tokens integer,output_tokens integer,cached_tokens integer,reasoning_tokens integer,neurons_reserved numeric not null,neurons numeric,usd numeric,usage_origin text not null default 'unknown' check(usage_origin in('reported','estimated','unknown')),status text not null default 'RESERVED' check(status in('RESERVED','SUCCEEDED','FAILED','UNCERTAIN')),duration_ms integer,error_code text,lease_until timestamptz not null default now()+interval '60 seconds',created_at timestamptz not null default now());
create index ai_attempts_work on ai_attempts(work_id,created_at);
create table ai_buckets(scope text not null,scope_key text not null,day date not null,neurons numeric not null default 0,primary key(scope,scope_key,day));
alter table ai_profiles enable row level security; alter table ai_limits enable row level security; alter table ai_buckets enable row level security;
create policy profile_read on ai_profiles for select using(true); create policy limits_read on ai_limits for select using(true);
create policy accounting_buckets on ai_buckets to monitor_accounting using(true) with check(true);
alter table ai_work enable row level security; alter table ai_attempts enable row level security;
create policy own_work on ai_work using(user_id=app.current_user_id() and app.is_tenant_member(tenant_id) and (case_id is null or app.can_read_case(tenant_id,case_id)) and (document_id is null or app.can_read_document(tenant_id,document_id))) with check(user_id=app.current_user_id() and app.is_tenant_member(tenant_id) and (case_id is null or app.can_read_case(tenant_id,case_id)) and (document_id is null or app.can_read_document(tenant_id,document_id)));
create policy own_attempt on ai_attempts using(user_id=app.current_user_id() and exists(select 1 from ai_work w where w.id=work_id and w.tenant_id=ai_attempts.tenant_id)) with check(user_id=app.current_user_id() and exists(select 1 from ai_work w where w.id=work_id and w.tenant_id=ai_attempts.tenant_id));
-- Only active scalar reservations are visible cross-actor to the quota role; no document text.
create policy accounting_concurrency on ai_attempts for select to monitor_accounting using(true);
grant select on ai_profiles,ai_limits to monitor_runtime,monitor_accounting;
grant select,insert on ai_work to monitor_runtime;
grant select,insert,update on ai_work,ai_attempts,ai_buckets to monitor_accounting;
grant select on ai_attempts to monitor_runtime;
create function app.reserve_ai_attempt(wid uuid,task_name text,provider_name text,model_name text,prompt_v text,tariff_v text,tariff_url text,inp integer,outp integer) returns uuid language plpgsql security definer set search_path=public,app as $$
declare w ai_work; p ai_profiles; n numeric; sid text; lim ai_limits; used numeric; result uuid; generation boolean; d date:=(now() at time zone 'UTC')::date;
begin
 if inp<1 or outp<0 then raise exception 'INVALID_RESERVATION';end if;
 perform pg_advisory_xact_lock(2026100401);
 select * into w from ai_work where id=wid and user_id=app.current_user_id() for update;
 if not found then raise exception 'WORK_NOT_ACCESSIBLE';end if;
 select * into p from ai_profiles where name=w.profile;
 generation:=model_name='@cf/qwen/qwen3-30b-a3b-fp8';
 if generation then n:=(inp*4625::numeric+outp*30475::numeric)/1000000;
 elsif model_name='@cf/baai/bge-m3' and outp=0 then n:=inp*1075::numeric/1000000;
 elsif model_name='@cf/baai/bge-reranker-base' and outp=0 then n:=inp*283::numeric/1000000;
 else raise exception 'UNPRICED_MODEL';end if;
 if provider_name<>'cloudflare' or (generation and (w.input_reserved+inp>p.input_limit or w.output_reserved+outp>p.output_limit or w.calls>=p.call_limit)) or (not generation and w.input_reserved+inp>p.input_limit) then raise exception 'WORK_BUDGET_EXCEEDED';end if;
 for lim in select * from ai_limits order by scope loop
  sid:=case lim.scope when 'app' then 'app' when 'tenant' then w.tenant_id::text else w.user_id end;
  insert into ai_buckets(scope,scope_key,day) values(lim.scope,sid,d) on conflict do nothing;
  select neurons into used from ai_buckets where scope=lim.scope and scope_key=sid and day=d for update;
  if used+n>lim.neurons then raise exception 'DAILY_BUDGET_EXCEEDED';end if;
  if generation and (select count(*) from ai_attempts a where a.model='@cf/qwen/qwen3-30b-a3b-fp8' and a.status='RESERVED' and a.lease_until>now() and (lim.scope='app' or lim.scope='tenant' and a.tenant_id=w.tenant_id or lim.scope='actor' and a.user_id=w.user_id))>=lim.concurrency then raise exception 'AI_CONCURRENCY_LIMIT';end if;
 end loop;
 if generation and w.case_id is not null and exists(select 1 from ai_attempts a join ai_work aw on aw.id=a.work_id where aw.case_id=w.case_id and a.model=model_name and a.status='RESERVED' and a.lease_until>now()) then raise exception 'CASE_CONCURRENCY_LIMIT';end if;
 update ai_buckets set neurons=neurons+n where day=d and ((scope='app' and scope_key='app') or (scope='actor' and scope_key=w.user_id) or (scope='tenant' and scope_key=w.tenant_id::text));
 update ai_work set input_reserved=input_reserved+inp,output_reserved=output_reserved+outp,calls=calls+case when generation then 1 else 0 end where id=wid;
 insert into ai_attempts(work_id,tenant_id,user_id,task,profile,provider,model,prompt_version,tariff_version,tariff_source,input_reserved,output_reserved,neurons_reserved) values(wid,w.tenant_id,w.user_id,left(task_name,80),w.profile,provider_name,model_name,prompt_v,tariff_v,tariff_url,inp,outp,n) returning id into result;
 return result;
end $$;
alter function app.reserve_ai_attempt(uuid,text,text,text,text,text,text,integer,integer) owner to monitor_accounting;
revoke all on function app.reserve_ai_attempt(uuid,text,text,text,text,text,text,integer,integer) from public;
grant execute on function app.reserve_ai_attempt(uuid,text,text,text,text,text,text,integer,integer) to monitor_runtime;
create function app.settle_ai_attempt(aid uuid,inp integer,outp integer,cached integer,reasoning integer,ms integer,state text,err text) returns void language plpgsql security definer set search_path=public,app as $$
declare a ai_attempts; w ai_work; n numeric; delta numeric;
begin
 perform pg_advisory_xact_lock(2026100401);
 select * into a from ai_attempts where id=aid and user_id=app.current_user_id() and status='RESERVED' for update;
 if not found then raise exception 'ATTEMPT_NOT_ACCESSIBLE';end if;
 select * into w from ai_work where id=a.work_id;
 if not found or state not in('SUCCEEDED','FAILED','UNCERTAIN') or inp<0 or outp<0 then raise exception 'INVALID_SETTLEMENT';end if;
 -- Missing usage, including timeouts, retains full reservation. No supposed zero savings.
 n:=case when inp is null or outp is null then a.neurons_reserved when a.model='@cf/qwen/qwen3-30b-a3b-fp8' then (inp*4625::numeric+outp*30475::numeric)/1000000 when a.model='@cf/baai/bge-m3' then inp*1075::numeric/1000000 else inp*283::numeric/1000000 end;
 delta:=n-a.neurons_reserved;
 update ai_buckets set neurons=greatest(0,neurons+delta) where day=(a.created_at at time zone 'UTC')::date and ((scope='app' and scope_key='app') or (scope='actor' and scope_key=w.user_id) or (scope='tenant' and scope_key=w.tenant_id::text));
 update ai_work set input_reserved=input_reserved+coalesce(inp,a.input_reserved)-a.input_reserved,output_reserved=output_reserved+coalesce(outp,a.output_reserved)-a.output_reserved where id=w.id;
 update ai_attempts set input_tokens=inp,output_tokens=outp,cached_tokens=cached,reasoning_tokens=reasoning,neurons=n,usd=n*0.011/1000,usage_origin=case when inp is null or outp is null then 'estimated' else 'reported' end,status=state,duration_ms=ms,error_code=left(err,80),lease_until=now() where id=aid;
end $$;
alter function app.settle_ai_attempt(uuid,integer,integer,integer,integer,integer,text,text) owner to monitor_accounting;
revoke all on function app.settle_ai_attempt(uuid,integer,integer,integer,integer,integer,text,text) from public;
grant execute on function app.settle_ai_attempt(uuid,integer,integer,integer,integer,integer,text,text) to monitor_runtime;
-- Enforce accumulated tool budget in the same persisted work.
create function app.use_ai_tool(wid uuid) returns boolean language plpgsql security definer set search_path=public,app as $$begin
 update ai_work w set tools=tools+1 from ai_profiles p where w.id=wid and w.user_id=app.current_user_id() and p.name=w.profile and w.tools<p.tool_limit;
 return found;
end $$;
alter function app.use_ai_tool(uuid) owner to monitor_accounting;
revoke all on function app.use_ai_tool(uuid) from public;grant execute on function app.use_ai_tool(uuid) to monitor_runtime;

alter table jobs add column case_id uuid references cases(id), add column document_id uuid references documents(id),add column lease_until timestamptz,add column fence bigint not null default 0,add column checkpoint jsonb not null default '{}',add column max_attempts integer not null default 3;
create policy ingestion_scope on jobs as restrictive using(job_type<>'LEGAL_INGEST' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id)))) with check(job_type<>'LEGAL_INGEST' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id))));
-- One ingestion lease globally at first; this role sees lease metadata only via functions.
grant select,update on jobs to monitor_accounting;
create policy accounting_jobs on jobs for select to monitor_accounting using(job_type='LEGAL_INGEST');
-- Existing restrictive policy must also allow scalar scheduling under a non-owner role.
drop policy ingestion_scope on jobs;
create policy ingestion_scope on jobs as restrictive using(job_type<>'LEGAL_INGEST' or current_user='monitor_accounting' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id)))) with check(job_type<>'LEGAL_INGEST' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id))));
create function app.next_legal_job() returns table(id uuid,actor text,tenant uuid) language sql security definer set search_path=public,app as $$
 select id,created_by,tenant_id from jobs where job_type='LEGAL_INGEST' and attempt_count<max_attempts and scheduled_at<=now() and (status='QUEUED' or status='RUNNING' and lease_until<now()) order by scheduled_at,id limit 1;
$$;
alter function app.next_legal_job() owner to monitor_accounting;
revoke all on function app.next_legal_job() from public;grant execute on function app.next_legal_job() to monitor_scheduler;
create function app.claim_legal_job(jid uuid,worker text) returns setof jobs language plpgsql security definer set search_path=public,app as $$
declare j jobs;begin
 perform pg_advisory_xact_lock(2026100402);
 if exists(select 1 from jobs where job_type='LEGAL_INGEST' and status='RUNNING' and lease_until>now()) then return;end if;
 select * into j from jobs where id=jid and job_type='LEGAL_INGEST' and created_by=app.current_user_id() and app.can_write_tenant(tenant_id) and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id)) and scheduled_at<=now() and attempt_count<max_attempts and (status='QUEUED' or status='RUNNING' and lease_until<now()) for update skip locked;
 if not found then return;end if;
 return query update jobs set status='RUNNING',started_at=coalesce(started_at,now()),locked_by=worker,locked_at=now(),lease_until=now()+interval '90 seconds',fence=fence+1,attempt_count=attempt_count+1,updated_at=now() where id=j.id returning *;
end $$;
alter function app.claim_legal_job(uuid,text) owner to monitor_accounting;
revoke all on function app.claim_legal_job(uuid,text) from public;grant execute on function app.claim_legal_job(uuid,text) to monitor_runtime;
revoke create on schema app from monitor_accounting;
commit;
