\set ON_ERROR_STOP on
create extension if not exists dblink;

alter table auth.users add column email_confirmed_at timestamptz, add column is_anonymous boolean not null default false;
update auth.users set email_confirmed_at = now() where id <> '00000000-0000-4000-8000-000000000003';

create table private.mile_garmin_activities (
  user_id uuid not null references auth.users(id),
  garmin_activity_id bigint not null,
  activity_type text not null,
  started_at timestamptz not null,
  raw_data jsonb not null default '{}'::jsonb,
  primary key (user_id, garmin_activity_id)
);
insert into private.mile_garmin_activities (user_id, garmin_activity_id, activity_type, started_at, raw_data) values
  ('00000000-0000-4000-8000-000000000001', 210300400, 'RUNNING', (now() at time zone interval '+14:00')::date - interval '12 hours', '{"startTimeOffsetInSeconds":46800}'),
  ('00000000-0000-4000-8000-000000000002', 210300401, 'RUNNING', (now() at time zone interval '+14:00')::date + interval '1 hour', '{}'),
  ('00000000-0000-4000-8000-000000000001', 210300402, 'CYCLING', (now() at time zone interval '+14:00')::date + interval '1 hour', '{}');

update public.av_training_data set training_data = jsonb_build_object('workouts', jsonb_build_array(
  pg_temp.running_workout('test-match-1', 0), pg_temp.running_workout('test-match-2', 0),
  pg_temp.running_workout('test-match-done', 0) || '{"status":"done"}'::jsonb))
where user_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');

-- First session holds the row lock while the owner opens a second device.
select dblink_connect('first_device', 'dbname=' || current_database());
select dblink_connect('second_device', 'dbname=' || current_database());
select dblink_exec('first_device', 'begin');
select dblink_exec('first_device', 'set local role authenticated');
select dblink_exec('second_device', 'set role authenticated');
select dblink_exec('first_device', $$set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'$$);
select dblink_exec('second_device', $$set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001'$$);

do $$
declare
  snapshot jsonb;
  receipt jsonb;
begin
  select training_data into snapshot from public.av_training_data where user_id='00000000-0000-4000-8000-000000000001';
  select result into receipt from dblink('first_device', format(
    'select public.mile_confirm_running_match(%L,%L,%L::jsonb,0)', 'test-match-1','210300400',snapshot #> '{workouts,0}')) as t(result jsonb);
  if receipt->>'version' <> '1' or receipt#>>'{workout,status}' <> 'done' then raise exception 'First link failed'; end if;
  perform dblink_send_query('second_device', format(
    'select public.mile_confirm_running_match(%L,%L,%L::jsonb,0)', 'test-match-2','210300400',snapshot #> '{workouts,1}'));
  perform pg_sleep(0.15);
  if dblink_is_busy('second_device') <> 1 then raise exception 'Second link failed to queue'; end if;
  perform dblink_exec('first_device','commit');
  perform from dblink_get_result('second_device',false) as t(receipt jsonb);
  if dblink_error_message('second_device') not like '%scheduled run changed%' then raise exception 'Concurrent stale request was accepted'; end if;
  perform from dblink_get_result('second_device',false) as t(receipt jsonb);

  if has_function_privilege('anon','public.mile_confirm_running_match(text,text,jsonb,bigint,text)','EXECUTE')
     or has_table_privilege('authenticated','mile_running_private.manual_matches','SELECT') then
    raise exception 'Unintended match privileges';
  end if;
  perform dblink_send_query('second_device', format(
    'insert into public.av_training_data(user_id,training_data) values(%L,%L::jsonb)
      on conflict(user_id) do update set training_data=excluded.training_data',
    '00000000-0000-4000-8000-000000000001',snapshot));
  perform from dblink_get_result('second_device',false) as t(result text);
  if dblink_error_message('second_device') not like '%changed on another device%' then raise exception 'Stale whole-document upsert was accepted'; end if;
  perform from dblink_get_result('second_device',false) as t(result text);
end;
$$;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$
declare
  own_id uuid := auth.uid();
  document jsonb;
  untouched jsonb;
  receipt jsonb;
begin
  select training_data into document from public.av_training_data where user_id=own_id;
  untouched := document #> '{workouts,1}';
  begin
    perform public.mile_confirm_running_match('test-match-2','210300400',untouched,1);
    raise exception 'Same active Garmin ID accepted for two sessions';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.mile_confirm_running_match('test-match-2','210300401',untouched,1);
    raise exception 'Another athlete’s Garmin activity was accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.mile_confirm_running_match('test-match-2','210300402',untouched,1);
    raise exception 'Cycling was accepted as Running';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.mile_confirm_running_match('test-match-done','210300402',document#>'{workouts,2}',1);
    raise exception 'Completed workout was altered';
  exception when sqlstate 'PT409' then null; end;
  begin
    update public.av_training_data set training_data=jsonb_set(document,'{workouts,1,matchId}','"210300400"') where user_id=own_id;
    raise exception 'Direct write bypassed duplicate detection';
  exception when sqlstate 'PT409' then null; end;

  receipt := public.mile_confirm_running_match('test-match-1','210300400',document#>'{workouts,0}',1,'unlink');
  if receipt->>'version' <> '2' or receipt#>>'{workout,status}' <> 'planned' then raise exception 'Unlink failed'; end if;
  begin
    update public.av_training_data set training_data=document where user_id=own_id;
    raise exception 'Stale save restored the removed match';
  exception when sqlstate 'PT409' then null; end;
  select training_data into document from public.av_training_data where user_id=own_id;
  update public.av_training_data set training_data=jsonb_set(document,'{workouts,1,note}','"keep this note"') where user_id=own_id;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  begin
    perform public.mile_confirm_running_match('test-match-2','210300400',untouched,2);
    raise exception 'Unverified nonmember allowed';
  exception when sqlstate 'PT403' then null; end;
end;
$$;
rollback;
select 'Running match concurrency, access, stale-save and unlink assertions passed' as result;
