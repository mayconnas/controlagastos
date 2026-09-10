-- Reproduz localmente o que o Supabase fornece pronto (auth.uid, auth.users
-- e os papéis anon/authenticated), para os testes rodarem contra o schema real.
create schema if not exists auth;
create table if not exists auth.users (
    id         uuid primary key,
    email      text,
    created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end;
$$;

grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
