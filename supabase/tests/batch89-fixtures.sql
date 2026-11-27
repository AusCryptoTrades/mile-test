-- Isolated test schema based on the catalogued production shape.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
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

create table public.mile_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z0-9_]{3,24}$'),display_name text not null,
 bio text not null default '' check(char_length(bio)<=300),avatar_url text,cover_url text,primary_sport text, disciplines text[] default array['Running'],
 is_discoverable boolean not null default false,is_private boolean not null default true,updated_at timestamptz not null default now(),
 message_privacy text not null default 'followers',workout_privacy text not null default 'followers',
 auto_share_activities boolean not null default true);
alter table public.mile_profiles enable row level security;
create table public.mile_follows(follower_id uuid,following_id uuid,status text);
create function public.mile_is_accepted_follower(target_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from public.mile_follows where follower_id=auth.uid() and following_id=target_user and status='accepted')
$$;
create policy profile_select on public.mile_profiles for select to authenticated
  using (user_id=(select auth.uid()) or (is_discoverable and not is_private) or public.mile_is_accepted_follower(user_id));
create policy profile_insert on public.mile_profiles for insert to authenticated with check (user_id=(select auth.uid()));
create policy profile_update on public.mile_profiles for update to authenticated using (user_id=(select auth.uid()));
grant select,insert,update on public.mile_profiles to authenticated;

create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
alter table storage.objects enable row level security;
create policy own_avatar on storage.objects to authenticated
 using (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
grant select,insert,update on storage.objects to authenticated;

insert into auth.users values
 ('89000000-0000-4000-8000-000000000001','legacy@example.test',now(),false),
 ('89000000-0000-4000-8000-000000000002','first@example.test',now(),false),
 ('89000000-0000-4000-8000-000000000003','second@example.test',now(),false),
 ('89000000-0000-4000-8000-000000000004','unconfirmed@example.test',null,false),
 ('89000000-0000-4000-8000-000000000005','uninvited@example.test',now(),false);
insert into public.av_members(user_id) values ('89000000-0000-4000-8000-000000000001');
insert into public.mile_profiles(user_id,username,display_name,bio,avatar_url,primary_sport,disciplines,is_discoverable,is_private,auto_share_activities)
values ('89000000-0000-4000-8000-000000000001','admin','Legacy athlete','Existing bio','https://example.test/avatar.jpg','Cycling',array['Cycling'],true,false,true);
insert into public.av_training_data(user_id,training_data) values ('89000000-0000-4000-8000-000000000001',
 '{"settings":{"athleteProfile":{"ftp":230,"threshold":"4:30"}},"workouts":[{"id":"preserve"}]}');
\ir ../../docs/batch845-invitations.sql
insert into public.av_invite_codes(id,code_hash,recipient_email)
values (1,extensions.crypt('FIXTURE-ONE',extensions.gen_salt('bf')),'first@example.test'),
 (2,extensions.crypt('FIXTURE-TWO',extensions.gen_salt('bf')),'second@example.test');
