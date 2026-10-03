begin;
create extension if not exists vector;

-- This function runs as the migration owner, preventing recursive RLS evaluation.
create or replace function app.can_read_case(t uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_tenant_member(t) and exists (
    select 1 from cases where tenant_id=t and id=c and deleted_at is null
    and (app.has_tenant_role(t,array['OWNER','ADMIN'])
      or responsible_user_id=app.current_user_id() or created_by=app.current_user_id()
      or exists(select 1 from case_assignments a where a.tenant_id=t and a.case_id=c and a.user_id=app.current_user_id()))
  );
$$;
create or replace function app.can_read_document(t uuid, d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_tenant_member(t) and exists(select 1 from documents
    where tenant_id=t and id=d and deleted_at is null and
    (case when case_id is not null then app.can_read_case(t,case_id)
      else app.has_tenant_role(t,array['OWNER','ADMIN']) or created_by=app.current_user_id() end));
$$;
create policy case_scope on public.cases as restrictive for all
using(app.can_read_case(tenant_id,id)) with check(app.is_tenant_member(tenant_id));
do $$ declare n text; begin
  foreach n in array array['case_parties','case_sources','case_assignments','judicial_events','deadlines','calendar_events','tasks','communications','fees','expenses'] loop
    execute format('create policy case_scope on public.%I as restrictive for all using(case_id is null or app.can_read_case(tenant_id,case_id)) with check(case_id is null or app.can_read_case(tenant_id,case_id))', n);
  end loop;
end $$;
create policy document_scope on public.documents as restrictive for all
using(app.can_read_document(tenant_id,id)) with check(
  case when case_id is not null then app.can_read_case(tenant_id,case_id)
  else app.has_tenant_role(tenant_id,array['OWNER','ADMIN']) or created_by=app.current_user_id() end);
create policy blob_scope on public.document_blobs as restrictive for all
using(app.can_read_document(tenant_id,document_id)) with check(app.can_read_document(tenant_id,document_id));
create policy version_scope on public.document_versions as restrictive for all
using(app.can_read_document(tenant_id,document_id)) with check(app.can_read_document(tenant_id,document_id));
create policy notification_scope on public.notifications as restrictive for all
using(user_id=app.current_user_id()) with check(user_id=app.current_user_id());

create table public.knowledge_documents (
  document_id uuid primary key references documents(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  status text not null default 'PENDING' check(status in('PENDING','PROCESSING','READY','NEEDS_OCR','FAILED')),
  checksum text not null, parser_version text not null default 'legal-v1',
  page_count integer not null default 0, chunk_count integer not null default 0,
  error_code text, indexed_at timestamptz, updated_at timestamptz not null default now()
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  document_id uuid not null references documents(id) on delete cascade,
  ordinal integer not null, page_start integer not null check(page_start>0), page_end integer not null,
  section text, content text not null, checksum text not null,
  embedding vector(1024), embedding_model text,
  search tsvector generated always as(to_tsvector('spanish',content)) stored,
  unique(document_id,ordinal), check(page_end>=page_start)
);
create index chunks_search on knowledge_chunks using gin(search);
create index chunks_document on knowledge_chunks(tenant_id,document_id);
create index chunks_vector on knowledge_chunks using hnsw(embedding vector_cosine_ops);

create table public.agent_threads (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  user_id text not null references users(id), case_id uuid references cases(id),
  title text not null default 'Nueva consulta', summary text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.agent_messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  role text not null check(role in('user','assistant')), content text not null,
  citations jsonb not null default '[]', metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  user_id text not null references users(id), thread_id uuid references agent_threads(id) on delete cascade,
  status text not null check(status in('RUNNING','COMPLETED','FAILED','ABSTAINED')),
  model text, provider text, tool_calls jsonb not null default '[]', chunk_ids uuid[] not null default '{}',
  input_tokens integer not null default 0, output_tokens integer not null default 0,
  latency_ms integer, error_code text, created_at timestamptz not null default now()
);
create index runs_budget on agent_runs(tenant_id,user_id,created_at);
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  user_id text not null references users(id), thread_id uuid references agent_threads(id) on delete cascade,
  case_id uuid references cases(id), action text not null check(action in('CREATE_TASK','DRAFT_COMMUNICATION','CREATE_DEADLINE')),
  payload jsonb not null, status text not null default 'PENDING' check(status in('PENDING','APPROVED','REJECTED','EXPIRED')),
  decided_by text references users(id), decided_at timestamptz, result_id uuid,
  expires_at timestamptz not null default now()+interval '24 hours', created_at timestamptz not null default now()
);
create table public.agent_memories (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id),
  user_id text not null references users(id), value text not null check(length(value)<=1000),
  created_at timestamptz not null default now()
);
create table public.agent_cache (
  key text primary key, tenant_id uuid not null references tenants(id), user_id text not null references users(id),
  payload jsonb not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);

do $$ declare n text; begin
  foreach n in array array['knowledge_documents','knowledge_chunks'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('create policy document_access on public.%I for all using(app.can_read_document(tenant_id,document_id)) with check(app.can_write_tenant(tenant_id) and app.can_read_document(tenant_id,document_id))',n);
  end loop;
  foreach n in array array['agent_threads','agent_runs','agent_approvals','agent_memories','agent_cache'] loop
    execute format('alter table public.%I enable row level security',n);
    execute format('create policy actor_access on public.%I for all using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id()) with check(app.is_tenant_member(tenant_id) and user_id=app.current_user_id())',n);
  end loop;
end $$;
create policy thread_case_scope on agent_threads as restrictive for all
using(case_id is null or app.can_read_case(tenant_id,case_id))
with check(case_id is null or app.can_read_case(tenant_id,case_id));
create policy approval_case_scope on agent_approvals as restrictive for all
using(case_id is null or app.can_read_case(tenant_id,case_id))
with check(case_id is null or app.can_read_case(tenant_id,case_id));
alter table agent_messages enable row level security;
create policy message_scope on agent_messages for all using(exists(
  select 1 from agent_threads t where t.id=thread_id and t.tenant_id=agent_messages.tenant_id
)) with check(exists(select 1 from agent_threads t where t.id=thread_id and t.tenant_id=agent_messages.tenant_id));

-- Optional TOTP MFA, implemented by Better Auth.
alter table public."user" add column "twoFactorEnabled" boolean default false;
create table public."twoFactor" (
  id text primary key, secret text not null, "backupCodes" text not null,
  "userId" text not null references public."user"(id) on delete cascade, verified boolean default true,
  "failedVerificationCount" integer default 0, "lockedUntil" timestamptz
);
alter table public."twoFactor" enable row level security;
create table public."rateLimit" (id text primary key, key text unique not null, count integer not null, "lastRequest" bigint not null);
alter table public."rateLimit" enable row level security;
create table public.bootstrap_claim (id text primary key, created_at timestamptz not null default now());
alter table public.bootstrap_claim enable row level security;

-- Owner connection is reserved for Better Auth and migrations. API uses this role.
do $$ begin if not exists(select 1 from pg_roles where rolname='monitor_runtime') then
  create role monitor_runtime login nosuperuser nobypassrls; end if; end $$;
grant usage on schema public,app to monitor_runtime;
grant execute on all functions in schema app to monitor_runtime;
do $$ declare n text; begin
  for n in select tablename from pg_tables where schemaname='public' and tablename not in('user','session','account','verification','twoFactor','rateLimit','bootstrap_claim') loop
    execute format('grant select,insert,update,delete on public.%I to monitor_runtime',n);
  end loop;
end $$;
revoke update,delete on public.audit_logs from monitor_runtime;
commit;
