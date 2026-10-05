begin;
alter table cases add column specialty text check(specialty in('WORK_ACCIDENT','HEALTH','LABOR','SUCCESSION')),add column legal_stage text,add column forum text;
alter table knowledge_documents drop constraint knowledge_documents_status_check;
alter table knowledge_documents add constraint knowledge_documents_status_check check(status in('PENDING','PROCESSING','READY','NEEDS_OCR','FAILED','PARTIAL','STALE'));
alter table knowledge_documents add column source_version integer not null default 1,add column artifact_key text,add column covered_pages integer not null default 0,add column extraction_status text not null default 'PENDING',add column extraction_version text;
alter table knowledge_chunks add column source_version integer not null default 1;
-- Scope identity must be constrained, not merely application-checked.
alter table cases add constraint cases_tenant_identity unique(tenant_id,id);
alter table documents add constraint documents_tenant_identity unique(tenant_id,id);
alter table document_versions add constraint versions_tenant_identity unique(tenant_id,document_id,version);
alter table jobs add foreign key(tenant_id,case_id) references cases(tenant_id,id),add foreign key(tenant_id,document_id) references documents(tenant_id,id);
alter table ai_work add foreign key(tenant_id,case_id) references cases(tenant_id,id),add foreign key(tenant_id,document_id) references documents(tenant_id,id);
create table case_facts(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,kind text not null check(kind in('FACT','EVENT','PERSON','ASSET')),label text not null check(length(label)<=200),original_value text not null check(length(original_value)<=4000),normalized_value text,event_date date,status text not null check(status in('REPORTED','EXTRACTED','CONFIRMED','REJECTED')),document_id uuid,source_version integer,source_checksum text,page integer check(page>0),section text,start_offset integer,end_offset integer,passage text check(length(passage)<=4000),author text not null references users(id),extraction_key text,stale boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(tenant_id,case_id) references cases(tenant_id,id),foreign key(tenant_id,document_id,source_version) references document_versions(tenant_id,document_id,version),unique(tenant_id,case_id,extraction_key),check((document_id is null and status='REPORTED') or (document_id is not null and source_version is not null and source_checksum is not null and passage is not null and start_offset>=0 and end_offset>start_offset)),unique(tenant_id,id));
create index facts_case on case_facts(tenant_id,case_id,event_date,created_at);
create table case_fact_reviews(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,fact_id uuid not null,old_value text,new_value text,status text not null,actor text not null references users(id),reason text not null,created_at timestamptz not null default now(),foreign key(tenant_id,case_id) references cases(tenant_id,id),foreign key(tenant_id,fact_id) references case_facts(tenant_id,id));
create table case_checklists(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,definition_key text not null,definition_version integer not null,label text not null check(length(label)<=200),description text not null default '',status text not null default 'PENDING' check(status in('PENDING','REQUESTED','RECEIVED','WAIVED')),responsible_user_id text references users(id),due_at timestamptz,depends_on uuid,document_id uuid,updated_at timestamptz not null default now(),created_at timestamptz not null default now(),created_by text not null references users(id),foreign key(tenant_id,case_id) references cases(tenant_id,id),foreign key(tenant_id,document_id) references documents(tenant_id,id),unique(tenant_id,case_id,definition_key,definition_version),unique(tenant_id,case_id,id),foreign key(tenant_id,case_id,depends_on) references case_checklists(tenant_id,case_id,id),check(depends_on is distinct from id));
create table case_outputs(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,kind text not null,title text not null,body text not null,revision integer not null default 1,parent_id uuid,metadata jsonb not null default '{}',stale boolean not null default false,reviewed_by text references users(id),reviewed_at timestamptz,created_by text not null references users(id),created_at timestamptz not null default now(),foreign key(tenant_id,case_id) references cases(tenant_id,id),unique(tenant_id,case_id,id),foreign key(tenant_id,case_id,parent_id) references case_outputs(tenant_id,case_id,id));
do $$declare n text;begin foreach n in array array['case_facts','case_fact_reviews','case_checklists','case_outputs'] loop
 execute format('alter table %I enable row level security',n);
 execute format('create policy case_read on %I for select using(app.can_read_case(tenant_id,case_id))',n);
 execute format('create policy case_insert on %I for insert with check(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id))',n);
 execute format('create policy case_update on %I for update using(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id)) with check(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id))',n);
 execute format('grant select,insert,update on %I to monitor_runtime',n);
 end loop;end$$;
create policy fact_evidence on case_facts as restrictive using(document_id is null or app.can_read_document(tenant_id,document_id)) with check(document_id is null or app.can_read_document(tenant_id,document_id));
create policy checklist_evidence on case_checklists as restrictive using(document_id is null or app.can_read_document(tenant_id,document_id)) with check(document_id is null or app.can_read_document(tenant_id,document_id));
revoke update on case_fact_reviews from monitor_runtime;
-- Invalidation at the source, so all API paths/associations are covered.
create function app.invalidate_document_derivatives() returns trigger language plpgsql set search_path=public,app as $$begin
 if new.deleted_at is distinct from old.deleted_at or new.case_id is distinct from old.case_id or new.content_hash is distinct from old.content_hash then
  update case_facts set stale=true,updated_at=now() where tenant_id=new.tenant_id and document_id=new.id;
  update case_outputs set stale=true where tenant_id=new.tenant_id and case_id=old.case_id;
  update case_checklists set status='PENDING',document_id=null,updated_at=now() where tenant_id=new.tenant_id and document_id=new.id;
  update jobs set status='CANCELLED',fence=fence+1,lease_until=null,updated_at=now() where tenant_id=new.tenant_id and document_id=new.id and job_type='LEGAL_INGEST' and status in('QUEUED','RUNNING');
  update knowledge_documents set status='STALE',updated_at=now() where tenant_id=new.tenant_id and document_id=new.id;
 end if;return new;
end$$;
create trigger invalidate_document before update of case_id,content_hash,deleted_at on documents for each row execute function app.invalidate_document_derivatives();
-- Drafts must be rechecked at read/review time, not trusted because RLS allowed an old output.
commit;
