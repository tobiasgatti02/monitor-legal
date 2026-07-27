begin;

create extension if not exists pgcrypto;
create schema if not exists app;

create type public.lead_status as enum (
  'NEW', 'TO_CONTACT', 'CONTACTED', 'MEETING_SCHEDULED', 'EVALUATING',
  'PROPOSAL_SENT', 'HIRED', 'NOT_HIRED', 'NO_RESPONSE', 'CONFLICT', 'OUT_OF_SCOPE'
);
create type public.case_status as enum ('ACTIVE', 'PAUSED', 'CLOSED', 'ARCHIVED');
create type public.task_status as enum ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');
create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type public.judicial_source as enum ('PJN', 'MEV_SCBA', 'SCBA_NOTIFICACIONES');
create type public.judicial_event_type as enum (
  'NEW_CASE', 'MOVEMENT', 'DISPATCH', 'NOTIFICATION', 'DOCUMENT', 'HEARING',
  'JUDGMENT', 'FILING', 'DEPENDENCY_CHANGE', 'OTHER'
);
create type public.event_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type public.review_status as enum ('UNREVIEWED', 'REVIEWED', 'DISMISSED');
create type public.deadline_status as enum ('DETECTED', 'POSSIBLE', 'CONFIRMED', 'COMPLETED', 'DISMISSED');
create type public.connector_status as enum ('CONNECTED', 'DEGRADED', 'DISCONNECTED', 'PAUSED');
create type public.sync_status as enum ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
create type public.communication_status as enum (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'REPLIED', 'FOLLOW_UP', 'CANCELLED'
);
create type public.communication_channel as enum ('EMAIL', 'WHATSAPP', 'PHONE', 'INTERNAL', 'PORTAL');

create table public.roles (
  code text primary key,
  label text not null,
  description text not null
);

insert into public.roles (code, label, description) values
  ('OWNER', 'Propietario', 'Control total del estudio'),
  ('ADMIN', 'Administrador', 'Administra equipo e integraciones'),
  ('LAWYER', 'Abogado', 'Gestiona asuntos jurídicos'),
  ('ASSISTANT', 'Asistente', 'Gestiona operación sin credenciales'),
  ('READ_ONLY', 'Sólo lectura', 'Consulta sin modificar')
on conflict (code) do nothing;

create table public.users (
  id text primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuit text,
  locality text,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  email text,
  phone text,
  whatsapp text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  role_code text not null references public.roles(code),
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'PERSON' check (kind in ('PERSON', 'COMPANY')),
  full_name text not null,
  document_id text,
  email text,
  phone text,
  whatsapp text,
  address text,
  locality text,
  preferred_channel public.communication_channel,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'POTENTIAL', 'PAUSED', 'CLOSED', 'DO_NOT_CONTACT')),
  source text,
  responsible_user_id text references public.users(id),
  communication_consent boolean not null default false,
  update_frequency_days integer check (update_frequency_days is null or update_frequency_days > 0),
  last_contact_at timestamptz,
  next_contact_at timestamptz,
  notes text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  relationship text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text,
  whatsapp text,
  consultation_reason text not null,
  source text,
  urgency public.task_priority not null default 'MEDIUM',
  status public.lead_status not null default 'NEW',
  responsible_user_id text references public.users(id),
  next_action text,
  next_action_at timestamptz,
  counterparty text,
  lost_reason text,
  converted_client_id uuid references public.clients(id),
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  activity_type text not null,
  note text,
  happened_at timestamptz not null default now(),
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id),
  docket_number text,
  title text not null,
  jurisdiction text,
  court text,
  venue text,
  status public.case_status not null default 'ACTIVE',
  priority public.task_priority not null default 'MEDIUM',
  responsible_user_id text references public.users(id),
  next_action text,
  next_action_at timestamptz,
  last_movement_at timestamptz,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.case_parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  name text not null,
  party_role text,
  document_id text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source public.judicial_source not null,
  account_label text not null,
  status public.connector_status not null default 'DISCONNECTED',
  schedule text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  next_run_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, account_label)
);

create table public.case_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  source public.judicial_source not null,
  source_case_id text,
  source_url text,
  last_synced_at timestamptz,
  content_hash text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, connector_id, source_case_id)
);

create table public.case_assignments (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  assignment_role text not null default 'RESPONSIBLE',
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

create table public.connector_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  encrypted_payload bytea not null,
  key_version integer not null default 1,
  last_used_at timestamptz,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, connector_id)
);

create table public.connector_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  encrypted_state bytea not null,
  key_version integer not null default 1,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  status public.sync_status not null default 'QUEUED',
  trigger text not null default 'SCHEDULE',
  started_at timestamptz,
  completed_at timestamptz,
  cases_checked integer not null default 0,
  events_detected integer not null default 0,
  error_code text,
  error_message text,
  diagnostics jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.raw_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid references public.connectors(id) on delete set null,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  kind text not null,
  storage_provider text not null,
  storage_key text not null,
  content_hash text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  retention_until timestamptz,
  sanitized boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, storage_provider, storage_key)
);

create table public.judicial_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  connector_id uuid not null references public.connectors(id) on delete cascade,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  source public.judicial_source not null,
  source_event_id text,
  source_url text,
  event_type public.judicial_event_type not null,
  source_date timestamptz,
  detected_at timestamptz not null default now(),
  title text not null,
  original_text text not null,
  normalized_text text not null,
  content_hash text not null,
  severity public.event_severity not null default 'MEDIUM',
  review_status public.review_status not null default 'UNREVIEWED',
  requires_lawyer_review boolean not null default true,
  possible_deadline boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index judicial_events_idempotency_idx
  on public.judicial_events (
    tenant_id,
    connector_id,
    event_type,
    coalesce(source_event_id, ''),
    content_hash,
    coalesce(source_date, 'epoch'::timestamptz)
  );

create table public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.judicial_events(id) on delete cascade,
  status public.review_status not null,
  previous_severity public.event_severity,
  severity public.event_severity,
  possible_deadline boolean,
  note text,
  reviewed_by text not null references public.users(id),
  reviewed_at timestamptz not null default now(),
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  source_event_id uuid references public.judicial_events(id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  status public.deadline_status not null default 'DETECTED',
  confirmed_by text references public.users(id),
  confirmed_at timestamptz,
  previous_due_at timestamptz,
  notes text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  deadline_id uuid references public.deadlines(id) on delete set null,
  event_type text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  responsible_user_id text references public.users(id),
  location text,
  external_calendar_id text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  source_event_id uuid references public.judicial_events(id) on delete set null,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'OPEN',
  priority public.task_priority not null default 'MEDIUM',
  due_at timestamptz,
  responsible_user_id text references public.users(id),
  recurrence_rule text,
  completed_at timestamptz,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  label text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  source_event_id uuid references public.judicial_events(id) on delete set null,
  channel public.communication_channel not null,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND', 'INTERNAL')),
  status public.communication_status not null default 'DRAFT',
  subject text,
  body text not null,
  sent_at timestamptz,
  approved_by text references public.users(id),
  approved_at timestamptz,
  external_id text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  channel public.communication_channel not null,
  subject_template text,
  body_template text not null,
  active boolean not null default true,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name, channel)
);

create table public.communication_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  communication_id uuid not null references public.communications(id) on delete cascade,
  decision text not null check (decision in ('APPROVED', 'REJECTED')),
  note text,
  decided_by text not null references public.users(id),
  decided_at timestamptz not null default now(),
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  name text not null,
  category text not null default 'OTHER',
  storage_provider text not null,
  storage_key text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  content_hash text not null,
  shared_with_client boolean not null default false,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, storage_provider, storage_key)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version integer not null,
  storage_key text not null,
  content_hash text not null,
  size_bytes bigint,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version)
);

create table public.fees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  agreement_type text not null,
  currency text not null default 'ARS',
  agreed_amount numeric(18, 2) not null default 0,
  notes text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fee_id uuid not null references public.fees(id) on delete cascade,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'ARS',
  paid_at timestamptz not null,
  method text,
  concept text,
  receipt_document_id uuid references public.documents(id) on delete set null,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null default 'ARS',
  incurred_at timestamptz not null,
  concept text not null,
  receipt_document_id uuid references public.documents(id) on delete set null,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connector_id uuid references public.connectors(id) on delete cascade,
  job_type text not null,
  status public.sync_status not null default 'QUEUED',
  idempotency_key text not null,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  error_code text,
  attempt_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  event_id uuid references public.judicial_events(id) on delete cascade,
  channel text not null,
  priority public.event_severity not null,
  title text not null,
  body text not null,
  idempotency_key text not null,
  read_at timestamptz,
  snoozed_until timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, idempotency_key)
);

create table public.notification_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  dashboard_enabled boolean not null default true,
  morning_digest boolean not null default true,
  evening_digest boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_portal_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id text not null,
  active boolean not null default true,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_id, auth_user_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  color text,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.entity_tags (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  created_by text not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tag_id, entity_type, entity_id)
);

create function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users', 'tenants', 'tenant_members', 'clients', 'client_contacts', 'leads',
    'lead_activities', 'cases', 'case_parties', 'case_sources', 'case_assignments',
    'connectors', 'connector_credentials', 'connector_sessions', 'sync_runs',
    'raw_artifacts', 'judicial_events', 'event_reviews', 'deadlines', 'calendar_events',
    'tasks', 'task_checklist_items', 'communications', 'communication_templates',
    'communication_approvals', 'documents', 'document_versions', 'fees', 'payments',
    'expenses', 'jobs', 'notifications', 'notification_preferences', 'audit_logs',
    'client_portal_access', 'tags', 'entity_tags'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I '
      'for each row execute function app.set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

create function app.current_user_id()
returns text
language plpgsql
stable
as $$
declare
  actor_id text;
begin
  if to_regprocedure('auth.user_id()') is not null then
    execute 'select auth.user_id()::text' into actor_id;
  end if;

  return coalesce(
    nullif(actor_id, ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('jwt.claims.sub', true), '')
  );
end;
$$;

create function app.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = app.current_user_id()
      and member.active
  );
$$;

create function app.has_tenant_role(target_tenant_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = app.current_user_id()
      and member.active
      and member.role_code = any(allowed_roles)
  );
$$;

create function app.can_write_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select app.has_tenant_role(
    target_tenant_id,
    array['OWNER', 'ADMIN', 'LAWYER', 'ASSISTANT']
  );
$$;

alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

create policy users_read_self_or_colleague on public.users
  for select
  using (
    id = app.current_user_id()
    or exists (
      select 1
      from public.tenant_members mine
      join public.tenant_members theirs on theirs.tenant_id = mine.tenant_id
      where mine.user_id = app.current_user_id()
        and mine.active
        and theirs.active
        and theirs.user_id = users.id
    )
  );

create policy users_update_self on public.users
  for update
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

create policy tenants_read_member on public.tenants
  for select using (app.is_tenant_member(id));
create policy tenants_update_admin on public.tenants
  for update using (app.has_tenant_role(id, array['OWNER', 'ADMIN']))
  with check (app.has_tenant_role(id, array['OWNER', 'ADMIN']));

create policy members_read_member on public.tenant_members
  for select using (app.is_tenant_member(tenant_id));
create policy members_manage_admin on public.tenant_members
  for all using (app.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']))
  with check (app.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients', 'client_contacts', 'leads', 'lead_activities', 'cases', 'case_parties',
    'case_sources', 'case_assignments', 'sync_runs', 'raw_artifacts', 'judicial_events',
    'event_reviews', 'deadlines', 'calendar_events', 'tasks', 'task_checklist_items',
    'communications', 'communication_templates', 'communication_approvals', 'documents',
    'document_versions', 'fees', 'payments', 'expenses', 'jobs', 'notifications',
    'notification_preferences', 'client_portal_access', 'tags', 'entity_tags'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy tenant_read on public.%I for select '
      'using (app.is_tenant_member(tenant_id))',
      table_name
    );
    execute format(
      'create policy tenant_insert on public.%I for insert '
      'with check (app.can_write_tenant(tenant_id))',
      table_name
    );
    execute format(
      'create policy tenant_update on public.%I for update '
      'using (app.can_write_tenant(tenant_id)) '
      'with check (app.can_write_tenant(tenant_id))',
      table_name
    );
    execute format(
      'create policy tenant_delete on public.%I for delete '
      'using (app.has_tenant_role(tenant_id, array[''OWNER'', ''ADMIN'']))',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'connectors', 'connector_credentials', 'connector_sessions'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy tenant_admin_all on public.%I for all '
      'using (app.has_tenant_role(tenant_id, array[''OWNER'', ''ADMIN''])) '
      'with check (app.has_tenant_role(tenant_id, array[''OWNER'', ''ADMIN'']))',
      table_name
    );
  end loop;
end;
$$;

alter table public.audit_logs enable row level security;
drop policy if exists tenant_read on public.audit_logs;
drop policy if exists tenant_insert on public.audit_logs;
drop policy if exists tenant_update on public.audit_logs;
drop policy if exists tenant_delete on public.audit_logs;
create policy audit_read_admin on public.audit_logs
  for select using (app.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));
create policy audit_insert_member on public.audit_logs
  for insert with check (app.is_tenant_member(tenant_id));

create index tenant_members_user_idx on public.tenant_members(user_id, active);
create index clients_tenant_status_idx on public.clients(tenant_id, status) where deleted_at is null;
create index leads_tenant_follow_up_idx on public.leads(tenant_id, status, next_action_at)
  where deleted_at is null;
create index cases_tenant_activity_idx on public.cases(tenant_id, status, last_movement_at)
  where deleted_at is null;
create index cases_tenant_client_idx on public.cases(tenant_id, client_id);
create index judicial_events_attention_idx
  on public.judicial_events(tenant_id, review_status, severity, detected_at desc);
create index judicial_events_case_idx on public.judicial_events(tenant_id, case_id, detected_at desc);
create index deadlines_due_idx on public.deadlines(tenant_id, status, due_at);
create index tasks_due_idx on public.tasks(tenant_id, status, due_at);
create index communications_client_idx on public.communications(tenant_id, client_id, created_at desc);
create index sync_runs_connector_idx on public.sync_runs(connector_id, created_at desc);
create index jobs_claim_idx on public.jobs(status, scheduled_at) where status = 'QUEUED';
create index audit_logs_tenant_created_idx on public.audit_logs(tenant_id, created_at desc);

commit;
