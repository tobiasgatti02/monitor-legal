begin;
-- A new case document changes the source inventory even before it is indexed.
-- Previously only edits/deletes/reassociation invalidated existing outputs.
create function app.invalidate_outputs_on_new_document() returns trigger
language plpgsql set search_path=public,app as $$begin
  if new.case_id is not null then
    update case_outputs set stale=true
    where tenant_id=new.tenant_id and case_id=new.case_id and not stale;
  end if;
  return new;
end$$;
create trigger invalidate_outputs_on_new_document
after insert on documents for each row
execute function app.invalidate_outputs_on_new_document();
commit;
