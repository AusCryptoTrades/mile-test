-- Isolated PostgreSQL CI fixtures, never run on a linked project.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create table public.av_members(user_id uuid primary key references auth.users);
alter table public.av_members enable row level security;
grant select on public.av_members to authenticated;
create policy own_member on public.av_members for select to authenticated using(user_id=auth.uid());
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003');
insert into public.av_members values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
