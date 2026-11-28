\set ON_ERROR_STOP on

create function pg_temp.expect_state(statement text, expected text) returns void
language plpgsql as $$
begin
  execute statement;
  raise exception 'Expected SQLSTATE % for %', expected, statement;
exception when others then
  if sqlstate <> expected then raise; end if;
end;
$$;

create function pg_temp.cycling_fixture() returns jsonb
language sql as $$
  select jsonb_build_object(
    'activeBlock','cycling-test',
    'blocks','[{"id":"cycling-test","sport":"Cycling"}]'::jsonb,
    'checkins',jsonb_build_object(
      (now() at time zone interval '-12:00')::date,'{"fatigue":"8","note":"synthetic private note"}'::jsonb,
      (now() at time zone interval '-12:00')::date-2,'{"fatigue":9}'::jsonb),
    'workouts',jsonb_build_array(jsonb_build_object(
      'id','ride-fixture','block','cycling-test','date',(now() at time zone interval '+14:00')::date+2,
      'revision',1,'cyclingPlanVersion',1,'status','planned','kind','threshold','sport','Cycling','demanding',true,
      'name','Threshold repeats','detail','fixture steps','structuredDetail','fixture steps',
      'plannedMinutes',45,'setting','indoor','surface','stationary','method','power',
      'structuredSteps','[
        {"kind":"step","intensity":"warmup","duration":{"kind":"time","seconds":600},"target":{"kind":"power","lowWatts":140,"highWatts":170}},
        {"kind":"repeat","count":2,"steps":[
          {"kind":"step","intensity":"interval","duration":{"kind":"time","seconds":420},"target":{"kind":"power","lowWatts":230,"highWatts":250}},
          {"kind":"step","intensity":"recovery","duration":{"kind":"time","seconds":180},"target":{"kind":"power","lowWatts":100,"highWatts":130}}
        ]},
        {"kind":"step","intensity":"interval","duration":{"kind":"time","seconds":420},"target":{"kind":"power","lowWatts":230,"highWatts":250}},
        {"kind":"step","intensity":"cooldown","duration":{"kind":"time","seconds":480},"target":{"kind":"power","lowWatts":100,"highWatts":130}}
      ]'::jsonb
    )));
$$;

set role anon;
select pg_temp.expect_state($$select public.mile_review_training_revision('Cycling')$$,'42501');
select pg_temp.expect_state($$select public.mile_cycling_revision_history()$$,'42501');
reset role;

set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select pg_temp.expect_state($$select public.mile_review_training_revision('Cycling')$$,'PT403');
select pg_temp.expect_state($$select public.mile_cycling_revision_history()$$,'PT403');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select pg_temp.expect_state($$select * from mile_training_private.revision_proposals$$,'42501');
select pg_temp.expect_state($$select mile_training_private.cycling_recovery_proposal(auth.uid(),'{}',now())$$,'42501');

do $$
declare
  document jsonb := pg_temp.cycling_fixture();
  recent_day text := ((now() at time zone interval '-12:00')::date)::text;
  proposal jsonb;
  changed jsonb;
  approved jsonb;
  duplicate jsonb;
  ride jsonb;
  recheck text;
begin
  update public.av_training_data set training_data=jsonb_set(document,'{checkins}',
    jsonb_build_object(recent_day,'{"fatigue":8}'::jsonb)) where user_id=auth.uid();
  if public.mile_review_training_revision('Cycling')->>'status' <> 'unavailable' then
    raise exception 'Single check-in produced a review';
  end if;
  update public.av_training_data set training_data=document where user_id=auth.uid();
  proposal:=public.mile_review_training_revision('Cycling');
  if proposal->>'status' is distinct from 'review'
    or (proposal#>>'{before,plannedMinutes}')::integer is distinct from 45
    or (proposal#>>'{after,plannedMinutes}')::integer is distinct from 30
    or (proposal#>>'{after,revision}')::integer is distinct from 2
    or proposal#>>'{after,setting}' is distinct from 'indoor'
    or jsonb_array_length(proposal#>'{evidence,checkins}') <> 2
    or proposal::text like '%synthetic private note%'
    or public.mile_review_training_revision('Cycling') is distinct from proposal then
    raise exception 'Unexpected cycling review %',proposal;
  end if;
  if (select training_data from public.av_training_data where user_id=auth.uid()) is distinct from document then
    raise exception 'Viewing the cycling review changed training data';
  end if;
  recheck:=format('select public.mile_approve_training_revision(%L,true)',proposal->>'id');
  perform pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,false)',proposal->>'id'),'PT422');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  perform pg_temp.expect_state(recheck,'PT404');
  if public.mile_cycling_revision_history() <> '[]'::jsonb then raise exception 'Foreign history leaked'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

  -- A new normal check-in, conflicting edit, completed workout, ambiguous
  -- schedule, or mismatched duration makes the existing review stale.
  foreach changed in array array[
    jsonb_set(document,array['checkins',recent_day,'fatigue'],'2'),
    jsonb_set(document,'{workouts,0,name}','"Edited ride"'),
    jsonb_set(document,'{workouts,0,status}','"done"'),
    jsonb_set(document,'{workouts,0,matchId}','"other-device-recording"',true),
    jsonb_set(document,'{workouts,0,plannedMinutes}','30'),
    jsonb_set(document,'{workouts,0,structuredSteps}','{}'),
    jsonb_set(document,'{workouts}',document->'workouts'||jsonb_build_array(document#>'{workouts,0}'||'{"id":"second-ride"}'))
  ] loop
    update public.av_training_data set training_data=changed where user_id=auth.uid();
    perform pg_temp.expect_state(recheck,'PT409');
  end loop;

  update public.av_training_data set training_data=document where user_id=auth.uid();
  perform set_config('mile_fixture.cycling_right_before',document::text,false);
  perform set_config('mile_fixture.cycling_proposal',proposal::text,false);
end;
$$;
reset role;

create extension dblink;
select dblink_connect('cycling_approval',format('host=127.0.0.1 port=%s dbname=%s user=postgres application_name=mile_cycling_approval',
  current_setting('port'),current_database()));
select dblink_exec('cycling_approval',$$set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'$$);
begin;
set local role authenticated;
select set_config('mile_fixture.cycling_receipt',public.mile_approve_training_revision(
  (current_setting('mile_fixture.cycling_proposal')::jsonb->>'id')::uuid,true)::text,false);
select dblink_send_query('cycling_approval',format('select public.mile_approve_training_revision(%L,true)',
  current_setting('mile_fixture.cycling_proposal')::jsonb->>'id'));
reset role;
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='mile_cycling_approval' and wait_event_type='Lock');
    if clock_timestamp()>deadline then raise exception 'Second approval never waited for the training record lock'; end if;
    perform pg_sleep(.02);
  end loop;
end;
$$;
commit;

do $$
declare duplicate jsonb;
begin
  select receipt into strict duplicate from dblink_get_result('cycling_approval') as result(receipt jsonb);
  if duplicate->>'status' is distinct from 'duplicate'
    or (select count(*) from mile_training_private.revision_proposals where sport='Cycling' and approved_at is not null) <> 1 then
    raise exception 'Bike revision was applied more than once';
  end if;
end;
$$;

select dblink_disconnect('cycling_approval');
set role authenticated;
do $$
declare
  proposal jsonb := current_setting('mile_fixture.cycling_proposal')::jsonb;
  document jsonb := current_setting('mile_fixture.cycling_right_before')::jsonb;
  receipt jsonb := current_setting('mile_fixture.cycling_receipt')::jsonb;
begin
  if receipt->>'status' is distinct from 'applied'
    or receipt->'garminRepublication' is distinct from 'false'::jsonb
    or receipt->'workout' is distinct from proposal->'after'
    or (select training_data#>'{workouts,0}' from public.av_training_data where user_id=auth.uid()) is distinct from proposal->'after'
    or jsonb_array_length(public.mile_cycling_revision_history()) <> 1 then
    raise exception 'Approved ride differs from the reviewed ride';
  end if;
  perform pg_temp.expect_state(format('update public.av_training_data set training_data=%L where user_id=auth.uid()',document),'PT409');
  perform pg_temp.expect_state($sql$update public.av_training_data set training_data=jsonb_set(
    training_data,'{workouts,0,revision}','3') where user_id=auth.uid()$sql$,'PT409');
  update public.av_training_data set training_data=jsonb_set(training_data,'{workouts,0,status}','"done"') where user_id=auth.uid();
  perform pg_temp.expect_state($sql$update public.av_training_data set training_data=jsonb_set(
    training_data,'{workouts,0,status}','"planned"') where user_id=auth.uid()$sql$,'PT409');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  if public.mile_cycling_revision_history() <> '[]'::jsonb then raise exception 'Approved history leaked'; end if;
end;
$$;
reset role;
