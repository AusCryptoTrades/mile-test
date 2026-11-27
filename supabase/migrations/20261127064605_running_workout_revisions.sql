-- Requires the existing Garmin publication registry (batch87-garmin-publications).
-- Deploy together with the cloud conflict handling and validate on staging first.
create schema mile_running_private;
revoke all on schema mile_running_private from public, anon, authenticated, service_role;

create table mile_running_private.workout_revisions (
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id text not null,
  event_id text not null,
  from_revision integer not null check (from_revision >= 1),
  to_revision integer not null check (to_revision = from_revision + 1),
  before_workout jsonb not null,
  after_workout jsonb not null,
  distance_factor numeric not null check (distance_factor >= 0.8 and distance_factor < 1),
  revised_at timestamptz not null default clock_timestamp(),
  primary key (user_id, workout_id, to_revision),
  unique (user_id, event_id)
);
alter table mile_running_private.workout_revisions enable row level security;
revoke all on mile_running_private.workout_revisions from public, anon, authenticated, service_role;

-- Legacy clients still upsert the whole document. Reject changes to an audited
-- prescription, including removal, duplication, and replay of older revisions.
-- Athletes can add notes and record completion or a match. A saved completion
-- or match cannot be reverted by a later whole-document write.
create function mile_running_private.guard_cloud_workout_revisions() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  mutable_fields constant text[] := array['status', 'matchId', 'note', 'rpe', 'completedAt'];
begin
  if exists (
    with latest as (
      select distinct on (workout_id) workout_id, after_workout
      from mile_running_private.workout_revisions
      where user_id = new.user_id
      order by workout_id, to_revision desc
    )
    select 1
    from latest r
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(new.training_data->'workouts') = 'array'
        then new.training_data->'workouts' else '[]'::jsonb end
    ) as w(workout) on w.workout->>'id' = r.workout_id
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(old.training_data->'workouts') = 'array'
        then old.training_data->'workouts' else '[]'::jsonb end
    ) as previous(workout) on previous.workout->>'id' = r.workout_id
    group by r.workout_id, r.after_workout
    having count(w.workout) <> 1
      or bool_or(w.workout - mutable_fields is distinct from r.after_workout - mutable_fields)
      or bool_or(
        (previous.workout->>'status' in ('done', 'completed')
          and w.workout->'status' is distinct from previous.workout->'status')
        or (previous.workout->>'matchId' is not null
          and w.workout->'matchId' is distinct from previous.workout->'matchId')
        or (previous.workout->>'completedAt' is not null
          and w.workout->'completedAt' is distinct from previous.workout->'completedAt')
      )
  ) then
    raise sqlstate 'PT409' using
      message = 'A running workout revision conflicts with this cloud save',
      detail = 'mile_running_revision_conflict';
  end if;
  return new;
end;
$$;
revoke all on function mile_running_private.guard_cloud_workout_revisions() from public, anon, authenticated, service_role;
create trigger mile_guard_cloud_workout_revisions
before update of training_data on public.av_training_data
for each row execute function mile_running_private.guard_cloud_workout_revisions();

-- Publication claims and revisions take the same training-row lock. A claim
-- made first freezes that session for manual reconciliation. A revision made
-- first invalidates stale Garmin previews before a remote create is attempted.
create function mile_running_private.guard_garmin_publication_revision() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  document jsonb;
  current_revision integer;
  matching_workouts integer;
begin
  select training_data into document
  from public.av_training_data
  where user_id = new.athlete_id
  for update;

  select to_revision into current_revision
  from mile_running_private.workout_revisions
  where user_id = new.athlete_id and workout_id = new.session_id::text
  order by to_revision desc limit 1;

  if found then
    select count(*) into matching_workouts
    from jsonb_array_elements(document->'workouts') as w(workout)
    where workout->>'id' = new.session_id::text
      and workout->>'date' = new.scheduled_date::text
      and workout->>'status' = 'planned'
      and workout->>'matchId' is null and workout->>'completedAt' is null;

    if new.revision <> current_revision or matching_workouts <> 1 then
      raise sqlstate 'PT409' using message = 'Garmin preview must match the current planned workout revision';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function mile_running_private.guard_garmin_publication_revision() from public, anon, authenticated, service_role;
create trigger mile_guard_garmin_publication_revision
before insert on private.mile_garmin_publications
for each row execute function mile_running_private.guard_garmin_publication_revision();

create function mile_running_private.revise_workout(
  p_workout_id text, p_expected_revision integer, p_event_id text, p_distance_factor numeric
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
  old_meters numeric;
  old_seconds numeric;
  step jsonb;
  step_meters numeric;
  resized_meters numeric;
  total_before numeric := 0;
  total_after numeric := 0;
  seconds_after numeric;
  revised_steps jsonb := '[]'::jsonb;
  detail_parts text[] := '{}';
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
      or previous_event.distance_factor <> p_distance_factor then
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

  if original->'runningPlanVersion' is distinct from '1'::jsonb
    or coalesce(original->>'kind', '') not in ('easy', 'recovery', 'long', 'taper', 'return', 'ultra')
    or jsonb_typeof(original->'detail') is distinct from 'string'
    or original->'structuredDetail' is distinct from original->'detail'
    or jsonb_typeof(original->'structuredSteps') is distinct from 'array'
    or jsonb_typeof(original->'meters') is distinct from 'number'
    or jsonb_typeof(original->'km') is distinct from 'number'
    or jsonb_typeof(original->'estimatedSeconds') is distinct from 'number'
    or jsonb_typeof(original->'plannedMinutes') is distinct from 'number' then
    raise sqlstate 'PT422' using message = 'Only canonical aerobic running workouts support distance reduction';
  end if;
  if original->'revision' is distinct from to_jsonb(p_expected_revision) or p_expected_revision = 2147483647 then
    raise sqlstate 'PT409' using message = 'Workout revision changed';
  end if;
  old_revision := p_expected_revision;

  -- Garmin session IDs are UUIDs. Text comparison also covers restored backups
  -- without letting a malformed ID cause a cast error in the publication lookup.
  if pg_input_is_valid(p_workout_id, 'uuid') and exists (
    select 1 from private.mile_garmin_publications
    where athlete_id = athlete
      and session_id = case when pg_input_is_valid(p_workout_id, 'uuid') then p_workout_id::uuid end
  ) then
    raise sqlstate 'PT409' using message = 'This Garmin workout requires publication reconciliation before revision';
  end if;

  old_meters := (original->>'meters')::numeric;
  old_seconds := (original->>'estimatedSeconds')::numeric;
  if old_meters <= 0 or old_seconds <= 0
    or abs((original->>'km')::numeric * 1000 - old_meters) > 1
    or (original->>'plannedMinutes')::numeric <> ceil(old_seconds / 60)
    or jsonb_array_length(original->'structuredSteps') not between 1 and 200 then
    raise sqlstate 'PT422' using message = 'Invalid stored workout totals';
  end if;

  for step in select value from jsonb_array_elements(original->'structuredSteps') loop
    if step->>'kind' is distinct from 'step'
      or coalesce(step->>'intensity', '') not in ('warmup', 'active', 'cooldown')
      or step#>>'{duration,kind}' is distinct from 'distance'
      or jsonb_typeof(step#>'{duration,meters}') is distinct from 'number' then
      raise sqlstate 'PT422' using message = 'Only flat aerobic distance steps can be revised';
    end if;
    step_meters := (step#>>'{duration,meters}')::numeric;
    resized_meters := floor(step_meters * p_distance_factor / 100) * 100;
    if resized_meters < 100 then
      raise sqlstate 'PT422' using message = 'A revised step would be shorter than 100 metres';
    end if;

    total_before := total_before + step_meters;
    total_after := total_after + resized_meters;
    revised_steps := revised_steps || jsonb_build_array(jsonb_set(step, '{duration,meters}', to_jsonb(resized_meters)));
    detail_parts := array_append(detail_parts, (step->>'intensity') || ': ' || (resized_meters / 1000)::numeric(20,1)::text || ' km');
  end loop;
  if total_before <> old_meters or total_after < old_meters * 0.8 or total_after >= old_meters then
    raise sqlstate 'PT422' using message = 'The revised total must be a reduction of no more than 20 percent';
  end if;

  seconds_after := ceil(old_seconds * total_after / old_meters);
  revised := original || jsonb_build_object(
    'revision', old_revision + 1, 'meters', total_after, 'km', total_after / 1000,
    'estimatedSeconds', seconds_after, 'plannedMinutes', ceil(seconds_after / 60),
    'structuredSteps', revised_steps, 'detail', array_to_string(detail_parts, ' · '),
    'structuredDetail', array_to_string(detail_parts, ' · ')
  );

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
revoke all on function mile_running_private.revise_workout(text, integer, text, numeric) from public, anon, authenticated, service_role;
grant usage on schema mile_running_private to authenticated;
grant execute on function mile_running_private.revise_workout(text, integer, text, numeric) to authenticated;

-- A direct authenticated call represents approval of this exact revision.
-- No background job or client-supplied athlete identity can invoke it.
create function public.mile_revise_running_workout(
  p_workout_id text, p_expected_revision integer, p_event_id text, p_distance_factor numeric
) returns jsonb
language sql security invoker set search_path = ''
as $$
  select mile_running_private.revise_workout(p_workout_id, p_expected_revision, p_event_id, p_distance_factor);
$$;
revoke all on function public.mile_revise_running_workout(text, integer, text, numeric) from public, anon, authenticated, service_role;
grant execute on function public.mile_revise_running_workout(text, integer, text, numeric) to authenticated;
