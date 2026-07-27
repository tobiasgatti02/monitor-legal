begin;

-- Almacenamiento MVP para archivos pequeños. El endpoint limita cada archivo a 5 MB.
-- Una futura migración puede mover el contenido a object storage sin cambiar documents.
create table public.document_blobs (
  document_id uuid primary key references public.documents(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  content bytea not null,
  created_at timestamptz not null default now()
);

alter table public.document_blobs enable row level security;

create policy document_blobs_read on public.document_blobs
  for select using (app.is_tenant_member(tenant_id));

create policy document_blobs_insert on public.document_blobs
  for insert with check (app.can_write_tenant(tenant_id));

create policy document_blobs_delete on public.document_blobs
  for delete using (app.has_tenant_role(tenant_id, array['OWNER', 'ADMIN']));

create index document_blobs_tenant_idx on public.document_blobs(tenant_id);

commit;
