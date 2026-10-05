begin;
alter table case_facts drop constraint case_facts_check;
alter table case_facts add constraint case_facts_evidence_shape check((document_id is null and status in('REPORTED','CONFIRMED','REJECTED')) or (document_id is not null and source_version is not null and source_checksum is not null and passage is not null and start_offset>=0 and end_offset>start_offset));
alter table case_facts add unique(tenant_id,case_id,id);
alter table case_fact_reviews add foreign key(tenant_id,case_id,fact_id) references case_facts(tenant_id,case_id,id);
create function app.check_fact_scope() returns trigger language plpgsql set search_path=public,app as $$begin
 if new.document_id is not null and not exists(select 1 from documents d join document_versions v on v.document_id=d.id and v.tenant_id=d.tenant_id where d.tenant_id=new.tenant_id and d.id=new.document_id and d.case_id=new.case_id and v.version=new.source_version and v.content_hash=new.source_checksum and d.deleted_at is null) then raise exception 'FACT_SOURCE_SCOPE_MISMATCH';end if;
 return new;
end$$;
create trigger fact_source_scope before insert or update of document_id,source_version,source_checksum,case_id on case_facts for each row execute function app.check_fact_scope();
create policy output_evidence on case_outputs as restrictive using(not exists(select 1 from jsonb_array_elements(coalesce(metadata->'evidence','[]')) e where not app.can_read_document(tenant_id,(e->>'documentId')::uuid))) with check(not exists(select 1 from jsonb_array_elements(coalesce(metadata->'evidence','[]')) e where not app.can_read_document(tenant_id,(e->>'documentId')::uuid)));
create policy accounting_job_updates on jobs for update to monitor_accounting using(job_type='LEGAL_INGEST') with check(job_type='LEGAL_INGEST');
drop policy ingestion_scope on jobs;
create policy ingestion_scope on jobs as restrictive using(job_type<>'LEGAL_INGEST' or current_user='monitor_accounting' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id)))) with check(job_type<>'LEGAL_INGEST' or current_user='monitor_accounting' or (created_by=app.current_user_id() and app.can_read_document(tenant_id,document_id) and (case_id is null or app.can_read_case(tenant_id,case_id))));
create or replace function app.next_legal_job() returns table(id uuid,actor text,tenant uuid) language plpgsql security definer set search_path=public,app as $$
declare j jobs;begin
 -- Bounded metadata scan only; no original or evidence content, no owner/BYPASSRLS.
 update jobs set status='FAILED',error_code='LEASE_ATTEMPTS_EXHAUSTED',lease_until=null,updated_at=now() where job_type='LEGAL_INGEST' and status='RUNNING' and lease_until<now() and attempt_count>=max_attempts;
 for j in select * from jobs where job_type='LEGAL_INGEST' and attempt_count<max_attempts and scheduled_at<=now() and (status='QUEUED' or status='RUNNING' and lease_until<now()) order by scheduled_at,id limit 50 loop
  perform set_config('request.jwt.claim.sub',j.created_by,true);
  if app.can_write_tenant(j.tenant_id) and app.can_read_document(j.tenant_id,j.document_id) and (j.case_id is null or app.can_read_case(j.tenant_id,j.case_id)) then
   return query select j.id,j.created_by,j.tenant_id;return;
  else update jobs set status='CANCELLED',fence=fence+1,error_code='ACCESS_REVOKED',lease_until=null,updated_at=now() where jobs.id=j.id;end if;
 end loop;
end $$;
commit;
