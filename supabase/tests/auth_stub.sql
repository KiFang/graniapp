-- Заглушка Supabase для локального теста миграций на чистом Postgres
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Минимальная схема Storage (как в Supabase)
create schema if not exists storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant all on storage.objects to authenticated;
grant execute on function storage.foldername(text) to authenticated, anon;

-- Заглушка pg_net: запросы складываются в таблицу, тест проверяет пуши
create schema if not exists net;
create table net.sent(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net.sent(url, body, headers) values (url, body, headers) returning id $$;
create schema if not exists extensions;
