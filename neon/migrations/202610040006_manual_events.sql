begin;
alter table judicial_events alter column connector_id drop not null;
alter table judicial_events add constraint manual_event_provenance check(connector_id is not null or coalesce(metadata->>'transport'='MANUAL',false));
create unique index manual_events_dedupe on judicial_events(tenant_id,case_id,source,coalesce(source_event_id,''),content_hash,coalesce(source_date,'epoch'::timestamptz)) where connector_id is null;
commit;
