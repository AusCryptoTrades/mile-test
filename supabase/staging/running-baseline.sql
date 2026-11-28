-- Only run in MILE Staging (fnyfeelynaozxtftrrga) with the documented baseline.
-- All records below are synthetic and the transaction is rolled back.
begin;
do $$
begin
 if exists (select from auth.users) or exists (select from public.av_members)
    or exists (select from public.av_training_data) or exists (select from public.av_invite_codes)
    or exists (select from private.mile_garmin_publications) then
   raise exception 'This baseline requires an empty staging project';
 end if;
end
$$;

insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000001','runner@example.test',now()),
 ('00000000-0000-4000-8000-000000000002','other@example.test',now()),
 ('00000000-0000-4000-8000-000000000003','nonmember@example.test',now());
insert into public.av_members(user_id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');

create function pg_temp.running_workout(id text, days_ahead integer)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', id, 'date', (now() at time zone interval '+14:00')::date + days_ahead, 'revision', 1,
    'runningPlanVersion', 1, 'kind', 'easy', 'sport', 'Running',
    'name', 'Easy aerobic run', 'block', 'fixture-running-plan', 'phase', 'base',
    'meters', 5000, 'km', 5, 'estimatedSeconds', 1775, 'plannedMinutes', 30,
    'estimatedPaceSeconds', 355, 'paceEstimateOnly', false,
    'purpose', 'Build aerobic endurance.', 'focus', 'Run at a conversational effort.',
    'detail', 'Warm-up: 0.75 km · 5:45–6:15/km. Main: 3.75 km · 130–148 bpm. Cooldown: 0.5 km · effort-based.',
    'structuredDetail', 'Warm-up: 0.75 km · 5:45–6:15/km. Main: 3.75 km · 130–148 bpm. Cooldown: 0.5 km · effort-based.',
    'status', 'planned', 'note', '', 'rpe', null, 'matchId', null,
    'targetRpe', 3, 'structuredSteps', '[
      {"kind":"step","intensity":"warmup","description":"Ease into the run","duration":{"kind":"distance","meters":750},"target":{"kind":"pace","fastSecondsPerKm":345,"slowSecondsPerKm":375}},
      {"kind":"step","intensity":"active","description":"Run at a conversational effort.","duration":{"kind":"distance","meters":3750},"target":{"kind":"heart_rate","lowBpm":130,"highBpm":148}},
      {"kind":"step","intensity":"cooldown","description":"Relaxed running","duration":{"kind":"distance","meters":500},"target":{"kind":"open"}}
    ]'::jsonb
  );
$$;

insert into public.av_training_data(user_id,training_data)
values ('00000000-0000-4000-8000-000000000001', jsonb_build_object(
 'activeBlock','fixture-running-plan',
 'blocks','[{"id":"fixture-running-plan","sport":"Running","runningPlan":{"config":{"adaptation":{"recovery":true}}}}]'::jsonb,
 'settings','{"units":"metric","athleteProfile":{"experience":"regular"}}'::jsonb,
 'workouts',jsonb_build_array(
  pg_temp.running_workout('legacy-calendar-run',5),
  pg_temp.running_workout('finished-run',2)||'{"status":"done"}'),
 'checkins',jsonb_build_object((now() at time zone 'UTC')::date::text,'{"fatigue":8}'::jsonb)
));

set local role authenticated;
do $$
declare
 review jsonb;
 approved jsonb;
 original jsonb;
begin
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
 begin
  perform public.mile_review_training_revision('Running');
  raise exception 'Non-member generated a proposal';
 exception when sqlstate 'PT403' then null;
 end;

 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 select training_data into strict original from public.av_training_data where user_id=auth.uid();
 review:=public.mile_review_training_revision('Running');
 if review->>'status' is distinct from 'review'
    or review#>>'{before,id}' is distinct from 'legacy-calendar-run'
    or review#>>'{after,meters}' is distinct from '4300' then
  raise exception 'Incorrect revision proposal';
 end if;

 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 if exists (select from public.av_training_data) then raise exception 'Cross-account training read'; end if;
 begin
  perform public.mile_approve_training_revision((review->>'id')::uuid,true);
  raise exception 'Cross-account approval succeeded';
 exception when sqlstate 'PT404' then null;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

 approved:=public.mile_approve_training_revision((review->>'id')::uuid,true);
 if approved->>'status' is distinct from 'applied' or
    public.mile_approve_training_revision((review->>'id')::uuid,true)->>'status' is distinct from 'duplicate' or
    (select training_data#>'{workouts,0}' from public.av_training_data where user_id=auth.uid()) is distinct from review->'after' or
    (select training_data#>'{workouts,1}' from public.av_training_data where user_id=auth.uid()) is distinct from original#>'{workouts,1}' or
    (select training_data->'settings' from public.av_training_data where user_id=auth.uid()) is distinct from original->'settings' then
  raise exception 'Revision receipt, protected workout, or user settings mismatch';
 end if;

 begin
  update public.av_training_data set training_data=original where user_id=auth.uid();
  raise exception 'Stale cloud save succeeded';
 exception when serialization_failure or sqlstate 'PT409' then null;
 end;
end
$$;
reset role;
select 'Running staging baseline passed' as result;
rollback;
