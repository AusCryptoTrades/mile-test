-- Isolated test schema based on the catalogued production shape.
do $$
begin
 if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end;
$$;
create schema auth;
create schema storage;
create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean default false, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
grant usage on schema auth, public, storage to authenticated,anon;

create table public.av_invite_codes(id bigint primary key,code_hash text not null,enabled boolean default true,max_uses int default 1,used_count int default 0);
create table public.av_members(user_id uuid primary key references auth.users(id) on delete cascade,invite_id bigint references public.av_invite_codes(id));
alter table public.av_members enable row level security;
create policy own_membership on public.av_members for select to authenticated using (user_id=(select auth.uid()));
grant select on public.av_members to authenticated;

create table public.av_training_data(user_id uuid primary key references auth.users(id) on delete cascade,
 training_data jsonb not null default '{}',updated_at timestamptz not null default now());
alter table public.av_training_data enable row level security;
create policy own_training on public.av_training_data to authenticated
  using (user_id=(select auth.uid()) and exists(select from public.av_members where user_id=(select auth.uid())))
  with check (user_id=(select auth.uid()) and exists(select from public.av_members where user_id=(select auth.uid())));
grant select,insert,update on public.av_training_data to authenticated;
grant select,insert,update on public.av_training_data to service_role;

create schema private;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key,name text);
insert into supabase_migrations.schema_migrations values
 ('20261127074143','staging_running_core_baseline'),
 ('20261127104627','staging_onboarding_prerequisites');
create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
create table storage.buckets(id text primary key,name text,public bool,file_size_limit bigint,allowed_mime_types text[]);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
alter table storage.objects enable row level security;
grant select on storage.objects to anon;
grant select,insert,update,delete on storage.objects to authenticated;
