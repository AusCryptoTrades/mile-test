-- Staging-only bootstrap. Derived from production catalog metadata.
-- The migration marker and empty account check prevent use in production.
begin;
do $$
begin
 if not exists (select from supabase_migrations.schema_migrations
     where version='20261127074143' and name='staging_running_core_baseline')
    or exists (select from auth.users) or exists (select from public.av_members)
    or exists (select from public.av_training_data) then
  raise exception 'Expected the verified, empty MILE Running staging baseline';
 end if;
end;
$$;

create table public.mile_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null check (char_length(display_name) between 1 and 80),
 bio text not null default '' check (char_length(bio)<=300),
 avatar_url text,
 primary_sport text,
 is_discoverable boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 is_private boolean not null default true,
 message_privacy text not null default 'followers' check (message_privacy in ('followers','anyone')),
 workout_privacy text not null default 'followers' check (workout_privacy in ('followers','anyone')),
 auto_share_activities boolean not null default true,
 cover_url text,
 disciplines text[] default array['Running']
);
create table public.mile_follows (
 follower_id uuid not null references public.mile_profiles(user_id) on delete cascade,
 following_id uuid not null references public.mile_profiles(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 status text not null default 'accepted' check (status in ('pending','accepted')),
 primary key (follower_id,following_id),
 check (follower_id<>following_id)
);
alter table public.mile_profiles enable row level security;
alter table public.mile_follows enable row level security;
revoke all on public.mile_profiles,public.mile_follows from public,anon,authenticated;
grant select,insert,update on public.mile_profiles to authenticated;
grant select,insert,delete on public.mile_follows to authenticated;
grant update(status) on public.mile_follows to authenticated;

create function public.mile_is_accepted_follower(target_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (select from public.mile_follows where follower_id=(select auth.uid())
   and following_id=target_user and status='accepted')
$$;
create function public.mile_can_request_follow(target_user uuid,requested_status text) returns boolean
language sql stable security definer set search_path='' as $$
 select target_user<>(select auth.uid()) and exists (
  select from public.mile_profiles p where p.user_id=target_user and p.is_discoverable
   and requested_status=case when p.is_private then 'pending' else 'accepted' end
 )
$$;
create function public.mile_discover_athletes()
returns table (user_id uuid,username text,display_name text,avatar_url text,is_private boolean)
language sql stable security definer set search_path='' as $$
 select p.user_id,p.username,p.display_name,p.avatar_url,p.is_private
 from public.mile_profiles p where p.is_discoverable and p.user_id<>(select auth.uid())
$$;
revoke all on function public.mile_is_accepted_follower(uuid),public.mile_can_request_follow(uuid,text),
 public.mile_discover_athletes() from public,anon,authenticated,service_role;
grant execute on function public.mile_is_accepted_follower(uuid),public.mile_can_request_follow(uuid,text),
 public.mile_discover_athletes() to authenticated;

create policy "Read authorised athlete profiles" on public.mile_profiles for select to authenticated
 using (user_id=(select auth.uid()) or (is_discoverable and not is_private) or public.mile_is_accepted_follower(user_id));
create policy "Create own profile" on public.mile_profiles for insert to authenticated
 with check (user_id=(select auth.uid()));
create policy "Update own profile" on public.mile_profiles for update to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "View follow relationships" on public.mile_follows for select to authenticated
 using ((select auth.uid()) in (follower_id,following_id));
create policy "Request to follow athlete" on public.mile_follows for insert to authenticated
 with check (follower_id=(select auth.uid()) and public.mile_can_request_follow(following_id,status));
create policy "Approve follow requests" on public.mile_follows for update to authenticated
 using (following_id=(select auth.uid()) and status='pending')
 with check (following_id=(select auth.uid()) and status='accepted');
create policy "Remove follow relationships" on public.mile_follows for delete to authenticated
 using ((select auth.uid()) in (follower_id,following_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('mile-avatars','mile-avatars',false,2097152,array['image/jpeg']);
create policy "MILE avatars owner read" on storage.objects for select to authenticated
 using (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "MILE avatars owner upload" on storage.objects for insert to authenticated
 with check (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "MILE avatars owner replace" on storage.objects for update to authenticated
 using (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "MILE avatars owner delete" on storage.objects for delete to authenticated
 using (bucket_id='mile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
