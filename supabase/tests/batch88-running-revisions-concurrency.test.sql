\set ON_ERROR_STOP on

create extension dblink;

-- This helper runs the real RPC as the connected authenticated test role.
create function public.mile_fixture_submit_revision(expected_revision integer, event_id text, distance_factor numeric)
returns jsonb language plpgsql security invoker as $$
begin
  return public.mile_revise_running_workout(
    '00000000-0000-4000-8000-000000000015', expected_revision, event_id, distance_factor
  );
exception when sqlstate 'PT409' then
  return '{"status":"conflict"}'::jsonb;
end;
$$;

create function public.mile_fixture_save_training(document jsonb)
returns text language plpgsql security invoker as $$
begin
  insert into public.av_training_data (user_id, training_data, updated_at)
  values (auth.uid(), document, now()) on conflict (user_id) do update
  set training_data = excluded.training_data, updated_at = excluded.updated_at;
  return 'saved';
exception when sqlstate 'PT409' then
  return 'conflict';
end;
$$;

create function pg_temp.await_waiting_writers(applications text[])
returns void language plpgsql as $$
declare
  deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when (select count(*) from pg_stat_activity
      where application_name = any (applications) and wait_event_type = 'Lock'
    ) = cardinality(applications);
    if clock_timestamp() >= deadline then
      raise exception 'Expected % to wait for the training document lock', applications;
    end if;
    perform pg_sleep(.02);
  end loop;
end;
$$;

select dblink_connect('revision_a', format('host=127.0.0.1 port=%s dbname=%s user=postgres application_name=mile_revision_a',
  current_setting('port'), current_database()));
select dblink_connect('revision_b', format('host=127.0.0.1 port=%s dbname=%s user=postgres application_name=mile_revision_b',
  current_setting('port'), current_database()));
select dblink_exec('revision_a', $$set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'$$);
select dblink_exec('revision_b', $$set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'$$);

begin;
select user_id from public.av_training_data where user_id = '00000000-0000-4000-8000-000000000001' for update;
select dblink_send_query('revision_a', $$select public.mile_fixture_submit_revision(1, 'race-a', .9)$$);
select dblink_send_query('revision_b', $$select public.mile_fixture_submit_revision(1, 'race-b', .95)$$);
select pg_temp.await_waiting_writers(array['mile_revision_a', 'mile_revision_b']);
commit;

do $$
declare
  outcomes text[];
begin
  select array_agg(response->>'status' order by response->>'status') into outcomes from (
    select response from dblink_get_result('revision_a') as result(response jsonb)
    union all
    select response from dblink_get_result('revision_b') as result(response jsonb)
  ) results;
  if outcomes is distinct from array['applied', 'conflict'] then
    raise exception 'Expected one winner and one stale revision, got %', outcomes;
  end if;
  perform response from dblink_get_result('revision_a') as result(response jsonb);
  perform response from dblink_get_result('revision_b') as result(response jsonb);
end;
$$;

begin;
select user_id from public.av_training_data where user_id = '00000000-0000-4000-8000-000000000001' for update;
select dblink_send_query('revision_a', $$select public.mile_fixture_submit_revision(2, 'race-duplicate', .9)$$);
select dblink_send_query('revision_b', $$select public.mile_fixture_submit_revision(2, 'race-duplicate', .9)$$);
select pg_temp.await_waiting_writers(array['mile_revision_a', 'mile_revision_b']);
commit;

do $$
declare
  outcomes text[];
begin
  select array_agg(response->>'status' order by response->>'status') into outcomes from (
    select response from dblink_get_result('revision_a') as result(response jsonb)
    union all
    select response from dblink_get_result('revision_b') as result(response jsonb)
  ) results;
  if outcomes is distinct from array['applied', 'duplicate'] then
    raise exception 'Expected one applied event and one idempotent receipt, got %', outcomes;
  end if;
  perform response from dblink_get_result('revision_a') as result(response jsonb);
  perform response from dblink_get_result('revision_b') as result(response jsonb);
  if (select array_agg(to_revision order by to_revision) from mile_running_private.workout_revisions
      where workout_id = '00000000-0000-4000-8000-000000000015') is distinct from array[2, 3] or
     (select training_data #>> '{workouts,4,revision}' from public.av_training_data
      where user_id = '00000000-0000-4000-8000-000000000001') is distinct from '3' then
    raise exception 'Expected exactly two history entries and revision 3 in training data';
  end if;
end;
$$;

-- A queued legacy upsert must see the revision committed while it was waiting.
select format('select public.mile_fixture_save_training(%L)', training_data) as stale_save
from public.av_training_data where user_id = '00000000-0000-4000-8000-000000000001' \gset
select dblink_exec('revision_a', $remote$
  begin;
  do $$
  begin
    if public.mile_fixture_submit_revision(3, 'race-cloud-save', .9)->>'status' is distinct from 'applied' then
      raise exception 'Could not start test revision';
    end if;
  end;
  $$;
$remote$);
select dblink_send_query('revision_b', :'stale_save');
select pg_temp.await_waiting_writers(array['mile_revision_b']);
select dblink_exec('revision_a', 'commit');
do $$
begin
  if (select response from dblink_get_result('revision_b') as result(response text)) is distinct from 'conflict' or
     (select training_data #>> '{workouts,4,revision}' from public.av_training_data
      where user_id = '00000000-0000-4000-8000-000000000001') is distinct from '4' then
    raise exception 'Overlapping whole-document save must reject the stale prescription';
  end if;
end;
$$;

select dblink_disconnect('revision_a');
select dblink_disconnect('revision_b');
drop function public.mile_fixture_submit_revision(integer, text, numeric);
drop function public.mile_fixture_save_training(jsonb);
