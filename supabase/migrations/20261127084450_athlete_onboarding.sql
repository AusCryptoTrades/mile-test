begin;

-- Existing members retain NULL. Membership inserts after rollout start onboarding.
alter table public.av_members
  add column if not exists onboarding_stage smallint check (onboarding_stage between 1 and 6),
  add column if not exists onboarding_revision integer not null default 0 check (onboarding_revision >= 0),
  add column if not exists onboarded_at timestamptz;
alter table public.av_members
  drop constraint if exists av_members_onboarding_completion,
  add constraint av_members_onboarding_completion
    check ((onboarded_at is not null) = coalesce(onboarding_stage = 6, false));
alter table public.av_members alter column onboarding_stage set default 1;
alter table public.mile_profiles alter column auto_share_activities set default false;

-- Profile and avatar writes require membership in addition to the established
-- ownership policies. Other storage buckets keep their existing access rules.
drop policy if exists "MILE members create profiles" on public.mile_profiles;
create policy "MILE members create profiles" on public.mile_profiles as restrictive
  for insert to authenticated with check (
    exists (select from public.av_members where user_id=(select auth.uid()))
  );
drop policy if exists "MILE members edit profiles" on public.mile_profiles;
create policy "MILE members edit profiles" on public.mile_profiles as restrictive
  for update to authenticated using (
    exists (select from public.av_members where user_id=(select auth.uid()))
  ) with check (
    exists (select from public.av_members where user_id=(select auth.uid()))
  );
drop policy if exists "MILE members upload avatars" on storage.objects;
create policy "MILE members upload avatars" on storage.objects as restrictive
  for insert to authenticated with check (bucket_id <> 'mile-avatars' or
    exists (select from public.av_members where user_id=(select auth.uid())));
drop policy if exists "MILE members replace avatars" on storage.objects;
create policy "MILE members replace avatars" on storage.objects as restrictive
  for update to authenticated using (bucket_id <> 'mile-avatars' or
    exists (select from public.av_members where user_id=(select auth.uid())))
  with check (bucket_id <> 'mile-avatars' or
    exists (select from public.av_members where user_id=(select auth.uid())));

create schema if not exists mile_onboarding_private;
revoke all on schema mile_onboarding_private from public, anon, authenticated, service_role;
grant usage on schema mile_onboarding_private to authenticated, service_role;

create or replace function mile_onboarding_private.valid_username(handle text) returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(handle ~ '^[a-z0-9_]{3,24}$'
    and handle !~ '^(admin|administrator|mile|support|staff|system|moderator|official|garmin|root|security|helpdesk)(_|$)'
    and handle not in ('miletraining','milefitness','mileofficial','milesupport','mileadmin'), false)
$$;

create or replace function mile_onboarding_private.validate_profile_username() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op='UPDATE' and new.username is not distinct from old.username then return new; end if;
  if tg_op='INSERT' and exists (
    select from public.mile_profiles where user_id=new.user_id and username=new.username
  ) then return new; end if;
  if not mile_onboarding_private.valid_username(new.username) then
    raise sqlstate 'PT422' using message='Use an available username with 3–24 letters, numbers or underscores';
  end if;
  return new;
end;
$$;
create or replace trigger mile_profile_validate_username before insert or update of username on public.mile_profiles
  for each row execute function mile_onboarding_private.validate_profile_username();

create or replace function mile_onboarding_private.valid_baseline(data jsonb) returns boolean
language plpgsql immutable set search_path = ''
as $$
declare field text; value jsonb;
begin
  if jsonb_typeof(data) is distinct from 'object' then return false; end if;
  foreach field in array array['ageBand','heightCm','weightKg','experience'] loop
    value:=data->field;
    if value is null or value='null'::jsonb then continue; end if;
    case field
      when 'ageBand' then
        if value not in ('"under18"','"18-24"','"25-34"','"35-44"','"45-54"','"55-64"','"65plus"') then return false; end if;
      when 'experience' then
        if value not in ('"beginner"','"regular"','"experienced"','"competitive"') then return false; end if;
      when 'heightCm' then
        if jsonb_typeof(value)<>'number' then return false; end if;
        if value::numeric not between 90 and 250 then return false; end if;
      when 'weightKg' then
        if jsonb_typeof(value)<>'number' then return false; end if;
        if value::numeric not between 30 and 350 then return false; end if;
    end case;
  end loop;
  return true;
end;
$$;

create or replace function mile_onboarding_private.validate_training_baseline() returns trigger
language plpgsql set search_path = ''
as $$
declare baseline jsonb:=new.training_data#>'{settings,athleteProfile}';
begin
  if baseline is null or baseline='null'::jsonb then return new; end if;
  if tg_op='UPDATE' and baseline is not distinct from old.training_data#>'{settings,athleteProfile}' then return new; end if;
  if not mile_onboarding_private.valid_baseline(baseline) then
    raise sqlstate 'PT422' using message='Check your private athlete profile measurements';
  end if;
  return new;
end;
$$;
create or replace trigger mile_training_validate_baseline before insert or update of training_data on public.av_training_data
  for each row execute function mile_onboarding_private.validate_training_baseline();

create or replace function mile_onboarding_private.member_id() returns uuid
language plpgsql set search_path = ''
as $$
declare athlete uuid:=auth.uid();
begin
  if athlete is null or not exists (
    select from auth.users u join public.av_members m on m.user_id=u.id
    where u.id=athlete and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
  ) then raise sqlstate 'PT403' using message='Confirmed MILE membership required'; end if;
  return athlete;
end;
$$;

create or replace function mile_onboarding_private.snapshot(athlete uuid) returns jsonb
language sql set search_path = ''
as $$
  select jsonb_build_object(
    'stage',m.onboarding_stage,'revision',m.onboarding_revision,
    'profile', (select jsonb_build_object('username',p.username,'display_name',p.display_name,
      'bio',p.bio,'avatar_url',p.avatar_url,'disciplines',p.disciplines,'primary_sport',p.primary_sport,
      'is_private',p.is_private) from public.mile_profiles p where p.user_id=athlete),
    'athlete', jsonb_build_object('ageBand',t.training_data#>'{settings,athleteProfile,ageBand}',
      'heightCm',t.training_data#>'{settings,athleteProfile,heightCm}',
      'weightKg',t.training_data#>'{settings,athleteProfile,weightKg}',
      'experience',t.training_data#>'{settings,athleteProfile,experience}'),
    'units',case when t.training_data#>>'{settings,preferences776,appearance,distance}'='mi'
      then 'imperial' else 'metric' end)
  from public.av_members m left join public.av_training_data t on t.user_id=m.user_id
  where m.user_id=athlete
$$;

create or replace function mile_onboarding_private.read_setup() returns jsonb
language sql security definer set search_path = ''
as $$ select mile_onboarding_private.snapshot(mile_onboarding_private.member_id()) $$;

create or replace function mile_onboarding_private.available_username(p_username text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare athlete uuid:=mile_onboarding_private.member_id();
  handle text:=lower(trim(p_username));
begin
  return mile_onboarding_private.valid_username(handle) and not exists (
    select from public.mile_profiles where username=handle and user_id<>athlete
  );
end;
$$;

create or replace function mile_onboarding_private.save_stage(p_stage integer,p_revision integer,p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid:=mile_onboarding_private.member_id();
  member public.av_members%rowtype;
  handle text;
  display text;
  biography text;
  avatar text;
  sports constant text[]:=array['Running','HYROX','Cycling','Swimming','Strength','Triathlon'];
  chosen text[];
  primary_sport_name text;
  profile_private boolean;
  document jsonb;
  settings jsonb;
  preferences jsonb;
  appearance jsonb;
  baseline jsonb;
  imperial boolean;
  next_stage integer;
begin
  select * into strict member from public.av_members where user_id=athlete for update;
  if member.onboarding_stage is null then
    raise sqlstate 'PT409' using message='Use Settings to edit an existing athlete profile';
  end if;
  if p_revision is distinct from member.onboarding_revision or member.onboarding_stage=6 then
    raise sqlstate 'PT409' using message='Profile setup has changed. Reload your progress';
  end if;
  if p_stage is null or p_stage<1 or p_stage>member.onboarding_stage
    or jsonb_typeof(p_fields) is distinct from 'object' then
    raise sqlstate 'PT422' using message='Complete the current setup stage first';
  end if;

  case p_stage
    when 1 then
      handle:=lower(trim(p_fields->>'username'));
      display:=trim(p_fields->>'display_name');
      biography:=coalesce(trim(p_fields->>'bio'),'');
      avatar:=p_fields->>'avatar_url';
      if not mile_onboarding_private.valid_username(handle)
        or jsonb_typeof(p_fields->'display_name') is distinct from 'string'
        or char_length(display) not between 1 and 60 or char_length(biography)>250
        or (p_fields->'bio' is not null and jsonb_typeof(p_fields->'bio') not in ('string','null')) then
        raise sqlstate 'PT422' using message='Check the name, username and biography limits';
      end if;
      if avatar is not null and (avatar !~ ('^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/mile-avatars/'
        || athlete::text || '/avatar\.jpg(\?v=[0-9]{1,16})?$')
        or not exists(select from storage.objects where bucket_id='mile-avatars' and name=athlete::text||'/avatar.jpg')) then
        raise sqlstate 'PT422' using message='Upload a profile photo through MILE';
      end if;
      insert into public.mile_profiles(user_id,username,display_name,bio,avatar_url,disciplines,
        is_private,is_discoverable,auto_share_activities,message_privacy,workout_privacy)
      values (athlete,handle,display,biography,avatar,'{}',true,false,false,'followers','followers')
      on conflict(user_id) do update set username=excluded.username,display_name=excluded.display_name,
        bio=excluded.bio,avatar_url=coalesce(excluded.avatar_url,mile_profiles.avatar_url),updated_at=now();
    when 2 then
      if jsonb_typeof(p_fields->'disciplines') is distinct from 'array' then
        raise sqlstate 'PT422' using message='Choose your sports';
      end if;
      select array_agg(value order by ordinality) into chosen
      from jsonb_array_elements_text(p_fields->'disciplines') with ordinality;
      primary_sport_name:=p_fields->>'primary_sport';
      if coalesce(cardinality(chosen),0) not between 1 and 6
        or exists (select from unnest(chosen) s where s is null or not (s=any(sports)))
        or cardinality(chosen)<>(select count(distinct s) from unnest(chosen) s)
        or primary_sport_name is null or not (primary_sport_name=any(chosen)) then
        raise sqlstate 'PT422' using message='Choose at least one sport and select one of them as your primary sport';
      end if;
      update public.mile_profiles set disciplines=chosen,primary_sport=primary_sport_name,updated_at=now() where user_id=athlete;
      if not found then raise sqlstate 'PT409' using message='Save your social profile first'; end if;
    when 3 then
      baseline:=jsonb_build_object('ageBand',p_fields->'ageBand','heightCm',p_fields->'heightCm',
        'weightKg',p_fields->'weightKg','experience',p_fields->'experience');
      if not mile_onboarding_private.valid_baseline(baseline) or
        coalesce(p_fields->>'units','') not in ('metric','imperial') then
        raise sqlstate 'PT422' using message='Check the athlete information and units';
      end if;
      imperial:=p_fields->>'units'='imperial';
      insert into public.av_training_data(user_id,training_data) values (athlete,
        '{"blocks":[],"workouts":[],"goals":[],"activities":[],"recoveryDays":[],"checkins":{},"matches":{},"activeBlock":null}')
        on conflict(user_id) do nothing;
      select training_data into strict document from public.av_training_data where user_id=athlete for update;
      if jsonb_typeof(document) is distinct from 'object' then
        raise sqlstate 'PT409' using message='Training data could not be saved. Check your backup in Settings';
      end if;
      settings:=case when jsonb_typeof(document->'settings')='object' then document->'settings' else '{}'::jsonb end;
      preferences:=case when jsonb_typeof(settings->'preferences776')='object' then settings->'preferences776' else '{}'::jsonb end;
      appearance:=case when jsonb_typeof(preferences->'appearance')='object' then preferences->'appearance' else '{}'::jsonb end;
      appearance:=appearance || jsonb_build_object(
        'distance',case when imperial then 'mi' else 'km' end,
        'weight',case when imperial then 'lb' else 'kg' end);
      settings:=settings || jsonb_build_object(
        'athleteProfile',((case when jsonb_typeof(settings->'athleteProfile')='object' then settings->'athleteProfile' else '{}'::jsonb end)
          -array['ageBand','heightCm','weightKg','experience']) || jsonb_strip_nulls(baseline),
        'preferences776',preferences||jsonb_build_object('appearance',appearance));
      update public.av_training_data set training_data=jsonb_set(document,'{settings}',settings),updated_at=now()
        where user_id=athlete;
    when 4 then
      -- The connected services integration owns authorization and its status.
      null;
    when 5 then
      if jsonb_typeof(p_fields->'is_private') is distinct from 'boolean' then
        raise sqlstate 'PT422' using message='Choose who can see your profile';
      end if;
      profile_private:=(p_fields->>'is_private')::boolean;
      if not exists(
        select from public.av_training_data where user_id=athlete
        and training_data#>>'{settings,preferences776,appearance,distance}' in ('km','mi')
      ) then raise sqlstate 'PT409' using message='Save your athlete units before finishing setup'; end if;
      update public.mile_profiles set is_private=profile_private,is_discoverable=not profile_private,auto_share_activities=false,
        message_privacy='followers',workout_privacy='followers',updated_at=now()
        where user_id=athlete and primary_sport=any(disciplines);
      if not found then raise sqlstate 'PT409' using message='Complete your social profile and sporting preferences'; end if;
  end case;

  next_stage:=greatest(member.onboarding_stage,p_stage+1);
  update public.av_members set onboarding_stage=next_stage,onboarding_revision=onboarding_revision+1,
    onboarded_at=case when next_stage=6 then clock_timestamp() end where user_id=athlete;
  return mile_onboarding_private.snapshot(athlete);
exception when unique_violation then
  raise sqlstate 'PT409' using message='That username is already taken';
end;
$$;

revoke all on all functions in schema mile_onboarding_private from public, anon, authenticated, service_role;
-- Triggers on existing tables run as the caller and need the pure validators.
grant execute on function mile_onboarding_private.valid_username(text),
  mile_onboarding_private.valid_baseline(jsonb) to authenticated, service_role;
grant execute on function mile_onboarding_private.read_setup(),
  mile_onboarding_private.available_username(text),mile_onboarding_private.save_stage(integer,integer,jsonb) to authenticated;

create or replace function public.mile_onboarding_state() returns jsonb language sql security invoker set search_path = ''
as $$ select mile_onboarding_private.read_setup() $$;
create or replace function public.mile_onboarding_username(p_username text) returns boolean language sql security invoker set search_path = ''
as $$ select mile_onboarding_private.available_username(p_username) $$;
create or replace function public.mile_onboarding_save(p_stage integer,p_revision integer,p_fields jsonb) returns jsonb
language sql security invoker set search_path = ''
as $$ select mile_onboarding_private.save_stage(p_stage,p_revision,p_fields) $$;
revoke all on function public.mile_onboarding_state(),public.mile_onboarding_username(text),
  public.mile_onboarding_save(integer,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mile_onboarding_state(),public.mile_onboarding_username(text),
  public.mile_onboarding_save(integer,integer,jsonb) to authenticated;

commit;
