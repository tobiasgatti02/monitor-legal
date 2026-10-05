begin;
-- Close publication races: evidence must still belong to the cause/version at INSERT.
create function app.check_output_evidence() returns trigger language plpgsql as $$declare e jsonb;begin
 if jsonb_array_length(coalesce(new.metadata->'evidence','[]'::jsonb))>200 then raise exception 'EVIDENCE_LIMIT';end if;
 for e in select * from jsonb_array_elements(coalesce(new.metadata->'evidence','[]'::jsonb)) loop
  if not exists(select 1 from case_facts f join documents d on d.tenant_id=f.tenant_id and d.id=f.document_id join document_versions v on v.tenant_id=f.tenant_id and v.document_id=f.document_id and v.version=f.source_version
   where f.tenant_id=new.tenant_id and f.case_id=new.case_id and f.id=(e->>'factId')::uuid and not f.stale and f.status<>'REJECTED' and d.case_id=new.case_id and d.deleted_at is null and d.id=(e->>'documentId')::uuid and f.source_version=(e->>'version')::int and f.source_checksum=e->>'checksum' and d.content_hash=f.source_checksum and v.content_hash=f.source_checksum) then raise exception 'OUTPUT_SOURCE_CHANGED';end if;
 end loop;return new;
end$$;
create trigger output_evidence_current before insert on case_outputs for each row execute function app.check_output_evidence();
commit;
