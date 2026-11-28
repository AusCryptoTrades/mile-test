\set ON_ERROR_STOP on
create function pg_temp.require_state(statement text, expected text) returns void language plpgsql as $$
begin
 execute statement;
 raise exception 'Expected %',expected;
exception when others then
 if sqlstate<>expected then raise; end if;
end;
$$;

set role anon;
select pg_temp.require_state($$select public.mile_review_training_revision('Swimming')$$,'42501');
select pg_temp.require_state($$select public.mile_swimming_revision_history()$$,'42501');
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select pg_temp.require_state($$select public.mile_review_training_revision('Swimming')$$,'PT403');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';

do $$
declare
 recent date := (now() at time zone interval '-12:00')::date;
 scheduled date := (now() at time zone interval '+14:00')::date+2;
 workout jsonb := jsonb_build_object('id','swim-ci','block','swim-1','date',scheduled,'sport','Swimming',
  'name','CSS repeats','status','planned','revision',1,'swimmingPlanVersion',1,'demanding',true,'family','css',
  'meters',600,'km',0.6,'poolMeters',25,'estimatedSeconds',1370,'plannedMinutes',23,'detail','fixture','structuredDetail','fixture',
  'structuredSteps','[
   {"kind":"step","intensity":"warmup","duration":{"kind":"distance","meters":100},"target":{"kind":"open"}},
   {"kind":"step","intensity":"rest","duration":{"kind":"time","seconds":20},"target":{"kind":"open"}},
   {"kind":"step","intensity":"interval","duration":{"kind":"distance","meters":400},"target":{"kind":"swim_pace","fastSecondsPer100m":105,"slowSecondsPer100m":110}},
   {"kind":"step","intensity":"cooldown","duration":{"kind":"distance","meters":100},"target":{"kind":"open"}}
  ]'::jsonb);
 document jsonb := jsonb_build_object('blocks','[{"id":"swim-1","sport":"Swimming"}]'::jsonb,
  'checkins',jsonb_build_object(recent,'{"fatigue":8,"note":"private-note-ci"}'::jsonb,recent-1,'{"fatigue":9}'::jsonb),
  'workouts',jsonb_build_array(workout));
 proposal jsonb;
 receipt jsonb;
 approval text;
 changed jsonb;
begin
 update public.av_training_data set training_data=document where user_id=auth.uid();
 proposal := public.mile_review_training_revision('Swimming');
 if proposal->>'status' is distinct from 'review'
   or (proposal#>>'{after,meters}')::numeric<>200
   or proposal#>>'{after,revisionSource}' is distinct from 'swimming-recovery-v1'
   or proposal::text like '%private-note-ci%'
   or (select training_data from public.av_training_data where user_id=auth.uid()) is distinct from document
 then raise exception 'Invalid review %',proposal; end if;
 approval := format('select public.mile_approve_training_revision(%L,true)',proposal->>'id');
 perform pg_temp.require_state(format('select public.mile_approve_training_revision(%L,false)',proposal->>'id'),'PT422');
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 perform pg_temp.require_state(approval,'PT404');
 if public.mile_swimming_revision_history()<>'[]'::jsonb then raise exception 'Foreign history leaked'; end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

 foreach changed in array array[
   jsonb_set(document,array['checkins',recent::text,'fatigue'],'2'),
   jsonb_set(document,'{workouts,0,status}','"done"'),
   jsonb_set(document,'{workouts,0,matchId}','"external"'),
   jsonb_set(document,'{workouts,0,poolMeters}','50'),
   jsonb_set(document,'{workouts,0,structuredSteps,2,duration,meters}','399'),
   jsonb_set(document,'{workouts,0,structuredSteps,1,duration,seconds}','"invalid"'),
   jsonb_set(document,'{workouts,0,structuredSteps,2,target,slowSecondsPer100m}','4000'),
   jsonb_set(document,'{workouts,0,structuredDetail}','"edited"')
 ] loop
   update public.av_training_data set training_data=changed where user_id=auth.uid();
   perform pg_temp.require_state(approval,'PT409');
 end loop;
 update public.av_training_data set training_data=document where user_id=auth.uid();
 receipt := public.mile_approve_training_revision((proposal->>'id')::uuid,true);
 if receipt->>'status' is distinct from 'applied'
   or receipt->'garminRepublication' is distinct from 'false'::jsonb
   or receipt->'workout' is distinct from proposal->'after'
   or jsonb_array_length(public.mile_swimming_revision_history())<>1
   or public.mile_approve_training_revision((proposal->>'id')::uuid,true)->>'status'<>'duplicate'
 then raise exception 'Invalid receipt %',receipt; end if;
 perform pg_temp.require_state(format('update public.av_training_data set training_data=%L where user_id=auth.uid()',document),'PT409');
 update public.av_training_data set training_data=jsonb_set(training_data,'{workouts,0,status}','"done"') where user_id=auth.uid();
 perform pg_temp.require_state($sql$update public.av_training_data set training_data=jsonb_set(training_data,
   '{workouts,0,status}','"planned"') where user_id=auth.uid()$sql$,'PT409');
end;
$$;
reset role;
select 'Swimming consent, ownership, stale snapshots, immutable history and completion passed';
