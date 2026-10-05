begin;
-- Reuse tasks for reviewed obligations; dates are entered by the lawyer, never inferred.
alter table tasks add column source_fact_id uuid;
alter table tasks add constraint task_source_fact_scope foreign key(tenant_id,case_id,source_fact_id) references case_facts(tenant_id,case_id,id);
create unique index task_obligation_dedupe on tasks(tenant_id,case_id,source_fact_id,title,coalesce(due_at,'epoch'::timestamptz)) where source_fact_id is not null;
create policy task_fact_scope on tasks as restrictive using(source_fact_id is null or current_user='monitor_accounting' or exists(select 1 from case_facts f where f.tenant_id=tasks.tenant_id and f.case_id=tasks.case_id and f.id=tasks.source_fact_id)) with check(source_fact_id is null or (current_user='monitor_accounting' and status='CANCELLED') or exists(select 1 from case_facts f where f.tenant_id=tasks.tenant_id and f.case_id=tasks.case_id and f.id=tasks.source_fact_id and f.status='CONFIRMED' and not f.stale and f.document_id is not null));
-- Narrow non-owner invalidator so revocation/staleness cannot leave an active obligation.
grant select,update on tasks to monitor_accounting;
grant select on case_facts to monitor_accounting;
create policy accounting_task_invalidation on tasks for update to monitor_accounting using(source_fact_id is not null) with check(source_fact_id is not null);
grant create on schema app to monitor_accounting;
create function app.invalidate_fact_obligation() returns trigger language plpgsql security definer set search_path=public,app as $$begin
 if new.stale or new.status<>'CONFIRMED' or new.normalized_value is distinct from old.normalized_value then
  update tasks set status='CANCELLED',description=coalesce(description,'')||E'\nFuente modificada: revisar obligación antes de reactivarla.',updated_at=now() where tenant_id=new.tenant_id and case_id=new.case_id and source_fact_id=new.id and status not in('DONE','CANCELLED');
 end if;return new;
end$$;
alter function app.invalidate_fact_obligation() owner to monitor_accounting;
revoke all on function app.invalidate_fact_obligation() from public;
create trigger fact_obligation_invalidation after update of stale,status,normalized_value on case_facts for each row execute function app.invalidate_fact_obligation();
revoke create on schema app from monitor_accounting;
-- A new template version is a new row; approval cannot mutate the approved model.
create function app.immutable_template_version() returns trigger language plpgsql as $$begin
 if (to_jsonb(new)-'approved_by'-'approved_at') is distinct from (to_jsonb(old)-'approved_by'-'approved_at') or old.approved_at is not null then raise exception 'TEMPLATE_VERSION_IMMUTABLE';end if;return new;
end$$;
create trigger template_version_immutable before update on legal_templates for each row execute function app.immutable_template_version();
commit;
