begin;
create table legal_templates(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),template_key uuid not null default gen_random_uuid(),version integer not null default 1,title text not null,specialty text not null,jurisdiction text not null,purpose text not null,body text not null check(length(body)<=8000),sections jsonb not null,source_kind text not null check(source_kind in('SYNTHETIC','LAWYER_MODEL')),approved_by text references users(id),approved_at timestamptz,created_by text not null references users(id),created_at timestamptz not null default now(),unique(tenant_id,template_key,version),unique(tenant_id,id));
alter table legal_templates enable row level security;
create policy template_read on legal_templates for select using(app.is_tenant_member(tenant_id));
create policy template_write on legal_templates for insert with check(app.can_write_tenant(tenant_id) and created_by=app.current_user_id());
create policy template_approve on legal_templates for update using(app.has_tenant_role(tenant_id,array['OWNER','ADMIN','LAWYER'])) with check(app.has_tenant_role(tenant_id,array['OWNER','ADMIN','LAWYER']));
grant select,insert,update on legal_templates to monitor_runtime;
create table legal_research_sources(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid not null,url text not null,title text not null,court text not null,decision_date date,jurisdiction text not null,source_kind text not null check(source_kind in('SUMMARY','FULL_TEXT','NORM')),content text not null check(length(content)<=100000),checksum text not null,fragment text not null,position text not null check(position in('FAVORABLE','ADVERSE','UNASSESSED')),access_origin text not null check(access_origin in('MANUAL','FETCH')),consulted_at timestamptz not null default now(),reviewed_by text references users(id),current_validity text not null default 'UNVERIFIED',created_by text not null references users(id),foreign key(tenant_id,case_id) references cases(tenant_id,id),unique(tenant_id,case_id,checksum));
alter table legal_research_sources enable row level security;
create policy research_read on legal_research_sources for select using(app.can_read_case(tenant_id,case_id));
create policy research_insert on legal_research_sources for insert with check(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id));
create policy research_update on legal_research_sources for update using(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id)) with check(app.can_write_tenant(tenant_id) and app.can_read_case(tenant_id,case_id));
grant select,insert,update on legal_research_sources to monitor_runtime;
-- A review may change normalized value/status, never the original evidence or authorship.
create function app.immutable_fact_original() returns trigger language plpgsql as $$begin
 if (new.original_value,new.document_id,new.source_version,new.source_checksum,new.page,new.start_offset,new.end_offset,new.passage,new.author) is distinct from (old.original_value,old.document_id,old.source_version,old.source_checksum,old.page,old.start_offset,old.end_offset,old.passage,old.author) then raise exception 'FACT_ORIGINAL_IMMUTABLE';end if;return new;
end$$;
create trigger fact_original_immutable before update on case_facts for each row execute function app.immutable_fact_original();
commit;
