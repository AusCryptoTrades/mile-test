-- Keep an athlete-confirmed Garmin match safe from delayed whole-document saves.
begin;

create table mile_running_private.manual_match_versions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version bigint not null check (version > 0)
);
create table mile_running_private.manual_matches (
  user_id uuid not null references mile_running_private.manual_match_versions(user_id) on delete cascade,
  workout_id text not null,
  activity_id text not null,
  primary key (user_id, workout_id),
  unique (user_id, activity_id)
);
alter table mile_running_private.manual_match_versions enable row level security;
alter table mile_running_private.manual_matches enable row level security;
revoke all on mile_running_private.manual_match_versions, mile_running_private.manual_matches from public, anon, authenticated, service_role;

create function mile_running_private.guard_manual_matches() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  expected_version bigint;
begin
  select version into expected_version from mile_running_private.manual_match_versions where user_id = new.user_id;
  if new.training_data->>'runningMatchVersion' is distinct from expected_version::text
    or exists (
      select 1
      from mile_running_private.manual_matches m
      left join lateral (
        select count(*) filter (where w->>'id' = m.workout_id) as workout_count,
          count(*) filter (where w->>'matchId' = m.activity_id) as match_count,
          count(*) filter (where w->>'id' = m.workout_id and w->>'matchId' = m.activity_id
            and w->>'status' = 'done' and w->>'sport' = 'Running') as correct_matches
        from jsonb_array_elements(case when jsonb_typeof(new.training_data->'workouts') = 'array'
          then new.training_data->'workouts' else '[]'::jsonb end) w
      ) counts on true
      where m.user_id = new.user_id and (counts.workout_count <> 1 or counts.match_count <> 1 or counts.correct_matches <> 1)
    ) then
    raise sqlstate 'PT409' using message = 'The linked run changed on another device', detail = 'mile_running_match_conflict';
  end if;
  return new;
end;
$$;
revoke all on function mile_running_private.guard_manual_matches() from public, anon, authenticated, service_role;
-- On update only. An upsert evaluates INSERT triggers before acquiring the row
-- lock, so the invariant must be checked against the committed row at UPDATE.
create trigger mile_guard_manual_matches
before update of training_data on public.av_training_data
for each row execute function mile_running_private.guard_manual_matches();

create function public.mile_confirm_running_match(
  p_workout_id text, p_activity_id text, p_expected_workout jsonb,
  p_expected_version bigint, p_action text default 'link'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb;
  version_now bigint;
  original jsonb;
  revised jsonb;
  workout_index bigint;
  workout_count bigint;
  verified_owner boolean;
begin
  if athlete is null or not exists (select from auth.users where id = athlete
      and email_confirmed_at is not null and not coalesce(is_anonymous, false))
    or not exists (select from public.av_members where user_id = athlete) then
    raise sqlstate 'PT403' using message = 'Verified MILE membership required';
  end if;
  if p_workout_id is null or p_workout_id !~ '^[A-Za-z0-9_.:-]{1,128}$'
    or p_activity_id is null or p_activity_id !~ '^[1-9][0-9]{0,19}$'
    or p_expected_workout is null or p_expected_version is null or p_expected_version < 0
    or p_action is null or p_action not in ('link', 'unlink') then
    raise sqlstate 'PT422' using message = 'Invalid running match request';
  end if;

  select training_data into document from public.av_training_data where user_id = athlete for update;
  if not found or jsonb_typeof(document->'workouts') is distinct from 'array' then
    raise sqlstate 'PT404' using message = 'Your scheduled runs are unavailable';
  end if;
  select coalesce((select version from mile_running_private.manual_match_versions where user_id = athlete), 0)
    into version_now;
  select count(*), min(ordinality) into workout_count, workout_index
    from jsonb_array_elements(document->'workouts') with ordinality w(item, ordinality)
    where item->>'id' = p_workout_id;
  if workout_count <> 1 then
    raise sqlstate 'PT409' using message = 'The scheduled run changed. Reload your plan.';
  end if;
  original := document->'workouts'->((workout_index - 1)::integer);
  if version_now <> p_expected_version or original is distinct from p_expected_workout
    or original->>'sport' is distinct from 'Running'
    or original->>'ownerId' is not null and original->>'ownerId' <> athlete::text
    or original->>'user_id' is not null and original->>'user_id' <> athlete::text then
    raise sqlstate 'PT409' using message = 'The scheduled run changed. Reload your plan.';
  end if;

  if p_action = 'link' then
    if original->>'status' is distinct from 'planned' or original->>'matchId' is not null
      or original->>'completedAt' is not null or original->>'completed_at' is not null
      or exists (select from jsonb_array_elements(document->'workouts') w where w->>'matchId' = p_activity_id) then
      raise sqlstate 'PT409' using message = 'This run or activity is already used. Reload your plan.';
    end if;
    -- Confirm ownership, sport and local day from the private provider row.
    if to_regclass('private.mile_garmin_activities') is null then
      raise sqlstate 'PT503' using message = 'Garmin activity verification is unavailable';
    end if;
    execute $provider$
      select exists (select from private.mile_garmin_activities
        where user_id = $1 and garmin_activity_id::text = $2
          and lower(activity_type) ~ '(running|^virtual_run$|^treadmill$)'
          and coalesce(
            case when raw_data->>'startTimeLocal' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(raw_data->>'startTimeLocal', 10) end,
            case when raw_data->>'startTimeOffsetInSeconds' ~ '^-?[0-9]{1,5}$'
                and abs((raw_data->>'startTimeOffsetInSeconds')::integer) <= 50400
              then ((started_at + make_interval(secs => (raw_data->>'startTimeOffsetInSeconds')::integer)) at time zone 'UTC')::date::text end,
            (started_at at time zone 'UTC')::date::text) = $3)
    $provider$ into verified_owner using athlete, p_activity_id, original->>'date';
    if not verified_owner
      or coalesce(original->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or original->>'date' > ((now() at time zone interval '+14:00')::date)::text then
      raise sqlstate 'PT422' using message = 'This recording cannot be matched to the selected run';
    end if;
    revised := original || jsonb_build_object('matchId', p_activity_id, 'status', 'done');
  else
    if original->>'matchId' is distinct from p_activity_id or original->>'status' is distinct from 'done' then
      raise sqlstate 'PT409' using message = 'This link has already changed';
    end if;
    revised := original || jsonb_build_object('matchId', null::text, 'status', 'planned');
  end if;

  insert into mile_running_private.manual_match_versions (user_id, version)
    values (athlete, version_now + 1) on conflict (user_id) do update set version = excluded.version;
  if p_action = 'link' then
    insert into mile_running_private.manual_matches (user_id, workout_id, activity_id)
      values (athlete, p_workout_id, p_activity_id);
  else
    delete from mile_running_private.manual_matches where user_id = athlete and workout_id = p_workout_id;
  end if;
  update public.av_training_data set
    training_data = jsonb_set(jsonb_set(document, array['workouts', (workout_index - 1)::text], revised),
      '{runningMatchVersion}', to_jsonb(version_now + 1)),
    updated_at = clock_timestamp()
  where user_id = athlete;
  return jsonb_build_object('version', version_now + 1, 'workout', revised, 'action', p_action);
end;
$$;
revoke all on function public.mile_confirm_running_match(text, text, jsonb, bigint, text) from public, anon, service_role;
grant execute on function public.mile_confirm_running_match(text, text, jsonb, bigint, text) to authenticated;
commit;
