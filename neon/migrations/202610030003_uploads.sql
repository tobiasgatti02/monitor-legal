begin;
create table document_uploads(
 id uuid primary key,tenant_id uuid not null references tenants(id),user_id text not null references users(id),case_id uuid references cases(id),
 name text not null,mime text not null,size_bytes bigint not null,storage_key text not null,
 status text not null default 'PENDING',expires_at timestamptz not null default now()+interval '10 minutes',created_at timestamptz not null default now()
);
alter table document_uploads enable row level security;
create policy upload_actor on document_uploads for all using(app.is_tenant_member(tenant_id) and user_id=app.current_user_id())
with check(app.can_write_tenant(tenant_id) and user_id=app.current_user_id() and (case_id is null or app.can_read_case(tenant_id,case_id)));
grant select,insert,update,delete on document_uploads to monitor_runtime;
create policy message_evidence_scope on agent_messages as restrictive for select using(not exists(
 select 1 from jsonb_array_elements(citations) source where
 (source->>'documentId' is not null and not app.can_read_document(tenant_id,(source->>'documentId')::uuid)) or
 (source->>'caseId' is not null and not app.can_read_case(tenant_id,(source->>'caseId')::uuid)) or
 (source->>'clientId' is not null and not app.can_read_client(tenant_id,(source->>'clientId')::uuid))
));
commit;
