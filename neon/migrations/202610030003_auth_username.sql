begin;

alter table public."user" add column if not exists username text;
alter table public."user" add column if not exists "displayUsername" text;
create unique index if not exists user_username_unique on public."user" (username);

commit;
