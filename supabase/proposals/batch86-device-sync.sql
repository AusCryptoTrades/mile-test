-- Proposed Batch 86 database contract. Staging only; do not apply to production.
-- Client-supplied Apple Health data is not provider-attested.
begin;
create table public.mile_device_consents (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 provider text not null check (provider = 'apple_health'),
 enabled boolean not null default false,
 primary key(user_id,provider)
);
create table public.mile_device_workouts (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 provider text not null check (provider = 'apple_health'),
 provider_id uuid not null,
 start_at timestamptz not null,
 end_at timestamptz not null,
 duration_seconds double precision not null check (duration_seconds between 0 and 2592000),
 distance_meters double precision check (distance_meters between 0 and 10000000),
 sport text check (sport in ('running','cycling','swimming','walking','strength')),
 primary key(user_id,provider,provider_id),
 check(end_at >= start_at),
 foreign key(user_id,provider) references public.mile_device_consents(user_id,provider) on delete cascade
);
create index mile_device_workouts_history_idx on public.mile_device_workouts(user_id,start_at desc);
alter table public.mile_device_consents enable row level security;
alter table public.mile_device_workouts enable row level security;
revoke all on public.mile_device_consents,public.mile_device_workouts from public,anon,authenticated;
grant select,insert,delete on public.mile_device_consents to authenticated;
grant update(enabled) on public.mile_device_consents to authenticated;
grant select,insert,delete on public.mile_device_workouts to authenticated;
grant update(start_at,end_at,duration_seconds,distance_meters,sport) on public.mile_device_workouts to authenticated;
create policy consent_read on public.mile_device_consents for select to authenticated using(user_id=(select auth.uid()));
create policy consent_insert on public.mile_device_consents for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.av_members m where m.user_id=(select auth.uid())));
create policy consent_update on public.mile_device_consents for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.av_members m where m.user_id=(select auth.uid())));
create policy consent_delete on public.mile_device_consents for delete to authenticated using(user_id=(select auth.uid()));
create policy workout_read on public.mile_device_workouts for select to authenticated using(user_id=(select auth.uid()));
create policy workout_delete on public.mile_device_workouts for delete to authenticated using(user_id=(select auth.uid()));
create policy workout_insert on public.mile_device_workouts for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.av_members m where m.user_id=(select auth.uid())) and exists(select 1 from public.mile_device_consents c where c.user_id=(select auth.uid()) and c.provider=mile_device_workouts.provider and c.enabled));
create policy workout_update on public.mile_device_workouts for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.av_members m where m.user_id=(select auth.uid())) and exists(select 1 from public.mile_device_consents c where c.user_id=(select auth.uid()) and c.provider=mile_device_workouts.provider and c.enabled));
-- Serialize inserts/updates against consent changes; prevent an in-flight write
-- from committing after consent has been disabled.
create function public.mile_device_require_consent() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.user_id is distinct from auth.uid() then raise exception 'Account mismatch' using errcode='42501'; end if;
 perform 1 from public.mile_device_consents c where c.user_id=new.user_id and c.provider=new.provider and c.enabled for share;
 if not found then raise exception 'Device consent required' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function public.mile_device_require_consent() from public,anon,authenticated;
create trigger mile_device_require_consent before insert or update on public.mile_device_workouts for each row execute function public.mile_device_require_consent();
commit;
