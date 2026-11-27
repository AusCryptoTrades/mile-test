-- Older Calendar IDs are text. Check them before executing the UUID cast.
-- Separate statements avoid a prepared SQL plan folding the cast in a CASE.
create function mile_running_private.has_garmin_publication(athlete uuid, workout_id text)
returns boolean language plpgsql set search_path = ''
as $$
declare session_uuid uuid;
begin
  if pg_input_is_valid(workout_id,'uuid') is distinct from true then return false; end if;
  session_uuid := workout_id::uuid;
  return exists (
    select 1 from private.mile_garmin_publications where athlete_id=athlete and session_id=session_uuid
  );
end;
$$;
revoke all on function mile_running_private.has_garmin_publication(uuid,text)
  from public, anon, authenticated, service_role;

create or replace function mile_running_private.revise_workout(
  p_workout_id text, p_expected_revision integer, p_event_id text, p_distance_factor numeric, p_expected_workout jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb;
  previous_event mile_running_private.workout_revisions%rowtype;
  workout_index integer;
  workout_count integer;
  original jsonb;
  revised jsonb;
  old_revision integer;
begin
  if athlete is null or not exists (select 1 from public.av_members where user_id = athlete) then
    raise sqlstate 'PT403' using message = 'MILE membership required';
  end if;
  if p_workout_id is null or p_workout_id !~ '^[a-z0-9_.-]{1,128}$'
    or p_event_id is null or p_event_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_expected_revision is null or p_expected_revision < 1
    or p_distance_factor is null or p_distance_factor < 0.8 or p_distance_factor >= 1 then
    raise sqlstate 'PT422' using message = 'Invalid running revision request';
  end if;

  select training_data into document
  from public.av_training_data
  where user_id = athlete
  for update;

  if not found then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;

  select * into previous_event
  from mile_running_private.workout_revisions
  where user_id = athlete and event_id = p_event_id;
  if found then
    if previous_event.workout_id <> p_workout_id
      or previous_event.from_revision <> p_expected_revision
      or previous_event.distance_factor <> p_distance_factor
      or previous_event.before_workout is distinct from p_expected_workout then
      raise sqlstate 'PT409' using message = 'Adaptation event has already been used';
    end if;
    return jsonb_build_object('status', 'duplicate', 'workoutId', p_workout_id, 'revision', previous_event.to_revision);
  end if;

  if jsonb_typeof(document->'workouts') is distinct from 'array' then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;
  select count(*), min(ordinality)::integer - 1 into workout_count, workout_index
  from jsonb_array_elements(document->'workouts') with ordinality as w(workout, ordinality)
  where workout->>'id' = p_workout_id;
  if workout_count <> 1 then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;

  original := document->'workouts'->workout_index;
  if original->>'sport' is distinct from 'Running'
    or original->>'status' is distinct from 'planned'
    or original->>'matchId' is not null or original->>'completedAt' is not null
    or coalesce(original->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(original->>'date', 'date') then
    raise sqlstate 'PT409' using message = 'Only future, unmatched planned runs can be revised';
  end if;
  -- Calendar dates carry no timezone. Require a future date even in UTC+14.
  if (original->>'date')::date <= (clock_timestamp() at time zone interval '+14:00')::date then
    raise sqlstate 'PT409' using message = 'Only future, unmatched planned runs can be revised';
  end if;

  select coalesce((
    select to_revision from mile_running_private.workout_revisions
    where user_id = athlete and workout_id = p_workout_id
    order by to_revision desc limit 1
  ), 1) into old_revision;
  if old_revision <> p_expected_revision or old_revision = 2147483647
    or original->'revision' is distinct from to_jsonb(old_revision)
    or original is distinct from p_expected_workout then
    raise sqlstate 'PT409' using message = 'Workout changed since review';
  end if;

  if mile_running_private.has_garmin_publication(athlete,p_workout_id) then
    raise sqlstate 'PT409' using message = 'This Garmin workout requires publication reconciliation before revision';
  end if;

  revised := mile_running_private.reduce_aerobic_workout(original, old_revision, p_distance_factor);

  insert into mile_running_private.workout_revisions
    (user_id, workout_id, event_id, from_revision, to_revision, before_workout, after_workout, distance_factor)
  values (athlete, p_workout_id, p_event_id, old_revision, old_revision + 1, original, revised, p_distance_factor);

  update public.av_training_data
  set training_data = jsonb_set(document, array['workouts', workout_index::text], revised),
      updated_at = clock_timestamp()
  where user_id = athlete;

  return jsonb_build_object('status', 'applied', 'workoutId', p_workout_id, 'revision', old_revision + 1);
end;
$$;
create or replace function mile_running_private.recovery_proposal(athlete uuid, document jsonb, evaluated_at timestamptz)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  evidence_day date;
  calendar_cutoff date := (evaluated_at at time zone interval '+14:00')::date;
  earliest_checkin date := (evaluated_at at time zone interval '-12:00')::date;
  fatigue text;
  current_block text := document->>'activeBlock';
  workout jsonb;
  expected_revision integer;
  factor constant numeric := 0.90;
begin
  -- Calendar check-ins store local dates and no zone. Use the latest check-in
  -- on a date currently in use anywhere, including a newer low-fatigue entry.
  select d.day, document#>>array['checkins',d.day::text,'fatigue']
    into evidence_day, fatigue
  from generate_series(0,calendar_cutoff-earliest_checkin) as offsets(days)
  cross join lateral (select earliest_checkin+offsets.days as day) as d
  where document#>array['checkins',d.day::text] is not null
  order by d.day desc limit 1;

  if coalesce(fatigue, '') !~ '^(7|8|9|10)$' or current_block is null
    or jsonb_typeof(document->'blocks') is distinct from 'array'
    or jsonb_typeof(document->'workouts') is distinct from 'array'
    or not exists (
      select 1 from jsonb_array_elements(document->'blocks') b
      where b->>'id' = current_block and b->>'sport' = 'Running'
        and b->'calendarVisible' is distinct from 'false'::jsonb
        and b#>'{runningPlan,config,adaptation,recovery}' = 'true'::jsonb
        and b#>'{runningPlan,config,athlete,injury}' is distinct from 'true'::jsonb
    ) then
    return null;
  end if;

  select w into workout
  from jsonb_array_elements(document->'workouts') as entries(w)
  where w->>'block' = current_block and w->>'sport' = 'Running' and w->>'status' = 'planned'
    and w->>'matchId' is null and w->>'completedAt' is null
    and w->>'date' > calendar_cutoff::text and w->>'date' <= (calendar_cutoff+7)::text
  order by w->>'date', w->>'id' limit 1;

  if workout is null or coalesce(workout->>'kind', '') not in ('easy','recovery','long','taper','ultra')
    or coalesce(workout->>'id', '') !~ '^[a-z0-9_.-]{1,128}$'
    or coalesce(workout->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(workout->>'date', 'date')
    or jsonb_typeof(workout->'revision') is distinct from 'number'
    or not pg_input_is_valid(workout->>'revision', 'integer')
    or (select count(*) from jsonb_array_elements(document->'workouts') w where w->>'id'=workout->>'id') <> 1
    or mile_running_private.has_garmin_publication(athlete,workout->>'id') then
    return null;
  end if;

  expected_revision := coalesce((
    select to_revision from mile_running_private.workout_revisions
    where user_id = athlete and workout_id = workout->>'id'
    order by to_revision desc limit 1
  ), 1);
  if expected_revision = 2147483647 or workout->'revision' is distinct from to_jsonb(expected_revision) then
    return null;
  end if;

  return jsonb_build_object(
    'policy','running-recovery-v1','evidenceDay',evidence_day,
    'evidence',jsonb_build_object('source','athlete-checkin','fatigue',fatigue::integer,'date',evidence_day),
    'before',workout,'after',mile_running_private.reduce_aerobic_workout(workout,expected_revision,factor),
    'operation',jsonb_build_object('type','reduce-distance','factor',factor)
  );
exception when sqlstate 'PT422' then
  -- Unsupported prescriptions can still be reviewed by the athlete.
  return null;
end;
$$;
