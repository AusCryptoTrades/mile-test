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

update public.av_training_data set training_data=training_data || jsonb_build_object(
  'activeBlock','fixture-running-plan',
  'blocks','[{"id":"fixture-running-plan","sport":"Running","runningPlan":{"config":{"adaptation":{"recovery":true}}}}]'::jsonb
) where user_id='00000000-0000-4000-8000-000000000001';

set role anon;
select pg_temp.expect_state($$select public.mile_review_training_revision('Running')$$,'42501');
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select pg_temp.expect_state($$select public.mile_review_training_revision('Running')$$,'PT403');

set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select pg_temp.expect_state($$select public.mile_revise_running_workout('fixture',1,'bypass',.9,'{}')$$,'42501');
select pg_temp.expect_state($$select mile_running_private.revise_workout('fixture',1,'bypass',.9,'{}')$$,'42501');
select pg_temp.expect_state($$select * from mile_training_private.revision_proposals$$,'42501');
-- Strength remains unsupported after Cycling and Swimming adapters are installed.
select pg_temp.expect_state($$select public.mile_review_training_revision('Strength')$$,'PT422');

do $$
declare
  day text := (clock_timestamp() at time zone 'UTC')::date::text;
  proposal jsonb;
  stale jsonb;
  review jsonb;
begin
  if public.mile_review_training_revision('Running')->>'status' is distinct from 'unavailable' then
    raise exception 'A missing check-in produced a review';
  end if;
  update public.av_training_data set training_data=training_data || jsonb_build_object(
    'checkins',jsonb_build_object(day,'{"fatigue":"8","note":"private fixture"}'::jsonb)
  ) where user_id=auth.uid();
  stale:=public.mile_review_training_revision('Running');
  if stale->>'status' is distinct from 'review' or stale#>>'{after,meters}' is distinct from '4300'
    or stale#>>'{evidence,source}' is distinct from 'athlete-checkin'
    or stale#>'{evidence,note}' is not null
    or public.mile_review_training_revision('Running') is distinct from stale then
    raise exception 'Expected the same canonical review and minimal evidence, got %', stale;
  end if;
  if (select training_data#>>'{workouts,0,revision}' from public.av_training_data where user_id=auth.uid())
    is distinct from '1' then raise exception 'Viewing a proposal wrote the workout'; end if;

  perform pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,false)',stale->>'id'),'PT422');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  perform pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,true)',stale->>'id'),'PT404');
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

  update public.av_training_data
  set training_data=jsonb_set(training_data,array['checkins',day,'fatigue'],'"9"') where user_id=auth.uid();
  perform pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,true)',stale->>'id'),'PT409');
  proposal:=public.mile_review_training_revision('Running');

  update public.av_training_data
  set training_data=jsonb_set(training_data,'{workouts,0,note}','"changed after review"') where user_id=auth.uid();
  perform pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,true)',proposal->>'id'),'PT409');
  review:=public.mile_review_training_revision('Running');
  perform set_config('mile_fixture.proposal_id',review->>'id',false);
  perform set_config('mile_fixture.reviewed_after',(review->'after')::text,false);
end;
$$;
reset role;

-- A newer local-date check-in with low fatigue takes precedence over earlier evidence.
do $$
declare document jsonb;
begin
  select training_data into document from public.av_training_data
    where user_id='00000000-0000-4000-8000-000000000001';
  document:=jsonb_set(document,'{checkins}','{"2026-11-26":{"fatigue":9},"2026-11-27":{"fatigue":8},"2026-11-28":{"fatigue":2}}');
  if mile_running_private.recovery_proposal(
    '00000000-0000-4000-8000-000000000001',document,'2026-11-27T11:00:00Z') is not null then
    raise exception 'An older check-in took precedence over a newer entry';
  end if;
end;
$$;

-- A publication claim created after review invalidates the preview.
insert into private.mile_garmin_publications
  (athlete_id,garmin_identity,session_id,revision,scheduled_date,payload_sha256,operation_id)
values ('00000000-0000-4000-8000-000000000001','fixture-garmin',
  '00000000-0000-4000-8000-000000000011',1,(clock_timestamp() at time zone interval '+14:00')::date+5,
  repeat('c',64),'00000000-0000-4000-8000-000000000077');
set role authenticated;
select pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,true)',
  current_setting('mile_fixture.proposal_id')),'PT409');
reset role;
delete from private.mile_garmin_publications where operation_id='00000000-0000-4000-8000-000000000077';

-- An expired proposal is rejected even if its evidence and workout are current.
update mile_training_private.revision_proposals
  set issued_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour'
  where id=current_setting('mile_fixture.proposal_id')::uuid;

set role authenticated;
select pg_temp.expect_state(format('select public.mile_approve_training_revision(%L,true)',
  current_setting('mile_fixture.proposal_id')),'PT409');
select set_config('mile_fixture.valid_id',public.mile_review_training_revision('Running')->>'id',false);
reset role;

-- A real overlapping approval runs on a second authenticated DB session.
create extension dblink;
select dblink_connect('approval',format('host=127.0.0.1 port=%s dbname=%s user=postgres application_name=mile_consent_race',
  current_setting('port'),current_database()));
select dblink_exec('approval',$$set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'$$);
begin;
set local role authenticated;
select set_config('mile_fixture.first_receipt',public.mile_approve_training_revision(
  current_setting('mile_fixture.valid_id')::uuid,true)::text,false);
select dblink_send_query('approval',format('select public.mile_approve_training_revision(%L,true)',
  current_setting('mile_fixture.valid_id')));
reset role;
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
  loop
    perform pg_stat_clear_snapshot();
    exit when exists(select 1 from pg_stat_activity where application_name='mile_consent_race' and wait_event_type='Lock');
    if clock_timestamp()>deadline then raise exception 'Approval never waited for the workout lock'; end if;
    perform pg_sleep(.02);
  end loop;
end;
$$;
commit;

do $$
declare
  approval_id uuid := current_setting('mile_fixture.valid_id')::uuid;
  expected jsonb := current_setting('mile_fixture.reviewed_after')::jsonb;
  second_receipt jsonb;
begin
  select receipt into strict second_receipt from dblink_get_result('approval') as result(receipt jsonb);
  if current_setting('mile_fixture.first_receipt')::jsonb->>'status' is distinct from 'applied'
    or second_receipt->>'status' is distinct from 'duplicate'
    or (select count(*) from mile_running_private.workout_revisions) <> 1
    or (select after_workout from mile_running_private.workout_revisions where event_id='proposal:'||approval_id) is distinct from expected
    or (select after_workout from mile_training_private.revision_proposals where id=approval_id and approved_at is not null)
      is distinct from expected then
    raise exception 'Approval did not commit the exact reviewed workout once';
  end if;
end;
$$;
select dblink_disconnect('approval');
set role authenticated;
do $$
begin
  if public.mile_review_training_revision('Running')->>'status' is distinct from 'already-applied' then
    raise exception 'An approved check-in could generate another adjustment';
  end if;
end;
$$;
reset role;

-- Restored legacy plans may still use non-UUID Calendar IDs.
update public.av_training_data dst
set training_data=jsonb_set(src.training_data,'{workouts}',jsonb_build_array(
  (src.training_data#>'{workouts,0}') || '{"id":"legacy-calendar-run","revision":1}'
))
from public.av_training_data src
where dst.user_id='00000000-0000-4000-8000-000000000002'
  and src.user_id='00000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$
declare proposal jsonb;
begin
  proposal:=public.mile_review_training_revision('Running');
  if proposal#>>'{before,id}' is distinct from 'legacy-calendar-run'
    or public.mile_approve_training_revision((proposal->>'id')::uuid,true)->>'status' is distinct from 'applied' then
    raise exception 'A legacy text Calendar ID could not be approved';
  end if;
end;
$$;
reset role;
