\set ON_ERROR_STOP on

create function pg_temp.expect_sqlstate(statement text, expected text)
returns void language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected SQLSTATE % for %', expected, statement;
exception when others then
  if sqlstate <> expected then raise; end if;
end;
$$;

-- Format a request from the athlete's currently loaded copy.
create function pg_temp.revise_current_run(workout_id text, expected_revision integer, event_id text, factor numeric)
returns jsonb language sql security invoker as $$
  select public.mile_revise_running_workout(
    workout_id, expected_revision, event_id, factor,
    (select workout from public.av_training_data
      cross join lateral jsonb_array_elements(training_data->'workouts') as w(workout)
      where user_id = auth.uid() and workout->>'id' = workout_id limit 1)
  );
$$;

set role anon;
select pg_temp.expect_sqlstate(
  $$select public.mile_revise_running_workout('00000000-0000-4000-8000-000000000011', 1, 'anonymous', .9, null)$$,
  '42501'
);
reset role;

set role authenticated;
select pg_temp.expect_sqlstate(
  $$select public.mile_revise_running_workout('00000000-0000-4000-8000-000000000011', 1, 'no-session', .9, null)$$,
  'PT403'
);
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select pg_temp.expect_sqlstate(
  $$select public.mile_revise_running_workout('00000000-0000-4000-8000-000000000019', 1, 'non-member', .9, null)$$,
  'PT403'
);

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select pg_temp.expect_sqlstate(
  $$select public.mile_revise_running_workout('00000000-0000-4000-8000-000000000011', 1, 'cross-account', .9, null)$$,
  'PT404'
);
do $$
begin
  if (select count(*) from public.av_training_data) <> 1 or exists (
    select from public.av_training_data where user_id <> auth.uid()
  ) then
    raise exception 'Authenticated member could read another account';
  end if;
  update public.av_training_data set training_data = '{}' where user_id <> auth.uid();
  if found then raise exception 'Authenticated member could modify another account'; end if;
end;
$$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$
declare
  original jsonb;
  changed jsonb;
  completed jsonb;
  workout jsonb;
  receipt jsonb;
  workout_id constant text := '00000000-0000-4000-8000-000000000011';
  upsert_sql constant text := 'insert into public.av_training_data (user_id, training_data, updated_at)
    values (auth.uid(), %L::jsonb, now()) on conflict (user_id) do update
    set training_data = excluded.training_data, updated_at = excluded.updated_at';
begin
  select training_data into strict original from public.av_training_data where user_id = auth.uid();
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, 1.1)', workout_id, 'distance-increase'
  ), 'PT422');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .1)', workout_id, 'excessive-reduction'
  ), 'PT422');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .9)',
    '00000000-0000-4000-8000-000000000012', 'completed'
  ), 'PT409');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .9)',
    '00000000-0000-4000-8000-000000000013', 'matched'
  ), 'PT409');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .9)',
    '00000000-0000-4000-8000-000000000014', 'historical'
  ), 'PT409');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .9)',
    '00000000-0000-4000-8000-000000000018', 'hard-session'
  ), 'PT422');

  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 9, %L, .9)',
    '00000000-0000-4000-8000-000000000020', 'untracked-initial-revision'
  ), 'PT409');

  update public.av_training_data
    set training_data = jsonb_set(training_data, '{workouts,0,name}', '"Edited easy run"')
    where user_id = auth.uid();
  perform pg_temp.expect_sqlstate(format(
    'select public.mile_revise_running_workout(%L, 1, %L, .9, %L::jsonb)',
    workout_id, 'stale-snapshot', original #> '{workouts,0}'
  ), 'PT409');
  update public.av_training_data set training_data = original where user_id = auth.uid();

  receipt := public.mile_revise_running_workout(workout_id, 1, 'reduction', .9, original #> '{workouts,0}');
  if receipt is distinct from jsonb_build_object('status', 'applied', 'workoutId', workout_id, 'revision', 2) then
    raise exception 'Unexpected apply response %', receipt;
  end if;
  receipt := public.mile_revise_running_workout(workout_id, 1, 'reduction', .9, original #> '{workouts,0}');
  if receipt is distinct from jsonb_build_object('status', 'duplicate', 'workoutId', workout_id, 'revision', 2) then
    raise exception 'Unexpected duplicate response %', receipt;
  end if;
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .95)', workout_id, 'reduction'
  ), 'PT409');
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 1, %L, .9)', workout_id, 'stale-revision'
  ), 'PT409');

  select training_data into strict changed from public.av_training_data where user_id = auth.uid();
  workout := changed #> '{workouts,0}';
  if (workout->>'meters')::integer is distinct from 4300 or (workout->>'km')::numeric is distinct from 4.3 or
     (workout->>'estimatedSeconds')::integer is distinct from 1527 or (workout->>'plannedMinutes')::integer is distinct from 26 or
     workout->'detail' is distinct from workout->'structuredDetail' or
     workout->>'detail' is distinct from 'Warm-up: 0.6 km · 5:45–6:15/km. Main: 3.3 km · 130–148 bpm. Cooldown: 0.4 km · effort-based.' or
     workout#>'{structuredSteps,0,target}' is distinct from original#>'{workouts,0,structuredSteps,0,target}' or
     workout#>'{structuredSteps,1,target}' is distinct from original#>'{workouts,0,structuredSteps,1,target}' or
     (select sum((step #>> '{duration,meters}')::integer)
       from jsonb_array_elements(workout->'structuredSteps') step) is distinct from 4300 or
     jsonb_set(changed, '{workouts,0}', original #> '{workouts,0}') is distinct from original then
    raise exception 'Prescription totals or unrelated training data changed unexpectedly: %', workout;
  end if;

  -- A newer client timestamp cannot override an audited prescription.
  perform pg_temp.expect_sqlstate(format(upsert_sql, original), 'PT409');
  perform pg_temp.expect_sqlstate(format(upsert_sql, changed #- '{workouts,0}'), 'PT409');
  perform pg_temp.expect_sqlstate(format(upsert_sql,
    jsonb_set(changed, '{workouts,0,structuredSteps,1,duration,meters}', '3750')
  ), 'PT409');

  -- Existing whole-document saves can add notes and complete the revised workout.
  completed := jsonb_set(changed, '{workouts,0}', workout || jsonb_build_object(
    'status', 'done', 'matchId', 'finished-activity', 'completedAt', now()
  ));
  execute format(upsert_sql, completed);
  perform pg_temp.expect_sqlstate(format(upsert_sql, changed), 'PT409');
  perform pg_temp.expect_sqlstate(format(upsert_sql, completed #- '{workouts,0,matchId}'), 'PT409');
  perform pg_temp.expect_sqlstate(format(upsert_sql, completed #- '{workouts,0,completedAt}'), 'PT409');
  execute format(upsert_sql, jsonb_set(completed, '{workouts,0,note}', '"Recorded offline"'));
  perform pg_temp.expect_sqlstate(format(
    'select pg_temp.revise_current_run(%L, 2, %L, .9)', workout_id, 'after-completion'
  ), 'PT409');
end;
$$;

select pg_temp.expect_sqlstate($$update mile_running_private.workout_revisions set to_revision = 999$$, '42501');
select pg_temp.expect_sqlstate($$delete from mile_running_private.workout_revisions$$, '42501');
reset role;

do $$
declare
  revision mile_running_private.workout_revisions%rowtype;
  stored jsonb;
begin
  if (select count(*) from mile_running_private.workout_revisions) <> 1 then
    raise exception 'Only a successful revision may write a history entry';
  end if;
  select * into strict revision from mile_running_private.workout_revisions where event_id = 'reduction';
  select training_data #> '{workouts,0}' into strict stored from public.av_training_data
    where user_id = revision.user_id;
  if revision.from_revision <> 1 or revision.to_revision <> 2 or revision.distance_factor <> .9 or
     revision.before_workout->>'meters' is distinct from '5000' or
     revision.after_workout->>'meters' is distinct from '4300' or
     revision.after_workout->>'status' is distinct from 'planned' or
     stored->>'status' is distinct from 'done' or stored->>'matchId' is distinct from 'finished-activity' or
     stored->>'note' is distinct from 'Recorded offline' then
    raise exception 'History snapshots must survive later cloud saves unmodified';
  end if;
end;
$$;

create function pg_temp.scheduled_date(workout_index integer) returns date language sql stable as $$
  select (training_data->'workouts'->workout_index->>'date')::date from public.av_training_data
    where user_id = '00000000-0000-4000-8000-000000000001';
$$;

-- A Garmin claim first prevents revision until delivery reconciliation is implemented.
insert into private.mile_garmin_publications (
  athlete_id, garmin_identity, session_id, revision, scheduled_date, payload_sha256, operation_id
) values (
  '00000000-0000-4000-8000-000000000001', 'verified-garmin', '00000000-0000-4000-8000-000000000016',
  1, pg_temp.scheduled_date(5), repeat('a', 64), '00000000-0000-4000-8000-000000000021'
);
set role authenticated;
select pg_temp.expect_sqlstate(
  $$select pg_temp.revise_current_run('00000000-0000-4000-8000-000000000016', 1, 'after-garmin', .9)$$,
  'PT409'
);

-- A revision first prevents a stale claim. The current revision can be claimed once.
do $$
begin
  if pg_temp.revise_current_run('00000000-0000-4000-8000-000000000017', 1, 'before-garmin', .9)->>'status' is distinct from 'applied' then
    raise exception 'Could not revise an unpublished workout';
  end if;
end;
$$;
reset role;
select pg_temp.expect_sqlstate($stale$
  insert into private.mile_garmin_publications (
    athlete_id, garmin_identity, session_id, revision, scheduled_date, payload_sha256, operation_id
  ) values (
    '00000000-0000-4000-8000-000000000001', 'verified-garmin', '00000000-0000-4000-8000-000000000017',
    1, pg_temp.scheduled_date(6), repeat('b', 64), '00000000-0000-4000-8000-000000000022'
  )
$stale$, 'PT409');
insert into private.mile_garmin_publications (
  athlete_id, garmin_identity, session_id, revision, scheduled_date, payload_sha256, operation_id
) values (
  '00000000-0000-4000-8000-000000000001', 'verified-garmin', '00000000-0000-4000-8000-000000000017',
  2, pg_temp.scheduled_date(6), repeat('c', 64), '00000000-0000-4000-8000-000000000023'
) on conflict (athlete_id, session_id) do nothing;
insert into private.mile_garmin_publications (
  athlete_id, garmin_identity, session_id, revision, scheduled_date, payload_sha256, operation_id
) values (
  '00000000-0000-4000-8000-000000000001', 'verified-garmin', '00000000-0000-4000-8000-000000000017',
  2, pg_temp.scheduled_date(6), repeat('c', 64), '00000000-0000-4000-8000-000000000024'
) on conflict (athlete_id, session_id) do nothing;
do $$
begin
  if (select count(*) from private.mile_garmin_publications
    where session_id = '00000000-0000-4000-8000-000000000017' and revision = 2
  ) <> 1 then
    raise exception 'Only one Garmin claim may exist for the current revision';
  end if;
end;
$$;
