begin;

create table public."user" (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.session (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public."user"(id) on delete cascade,
  token text not null unique,
  "expiresAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table public.account (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public."user"(id) on delete cascade,
  "accountId" text not null,
  "providerId" text not null,
  "accessToken" text,
  "refreshToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  "idToken" text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("providerId", "accountId")
);

create table public.verification (
  id text primary key default gen_random_uuid()::text,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index session_user_idx on public.session("userId");
create index session_expiry_idx on public.session("expiresAt");
create index account_user_idx on public.account("userId");
create index verification_identifier_idx on public.verification(identifier);
create index verification_expiry_idx on public.verification("expiresAt");

create function app.sync_better_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (new.id, new.email, new.name, new.image)
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = now();
  return new;
end;
$$;

create trigger sync_better_auth_user
after insert or update of name, email, image on public."user"
for each row execute function app.sync_better_auth_user();

-- Las tablas Auth nunca se exponen mediante Data API.
alter table public."user" enable row level security;
alter table public.session enable row level security;
alter table public.account enable row level security;
alter table public.verification enable row level security;

commit;
