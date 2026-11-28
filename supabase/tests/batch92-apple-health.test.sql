\set ON_ERROR_STOP on
create function pg_temp.apple_expect(statement text, expected text) returns void
language plpgsql as $$
begin
 execute statement;
 raise exception 'Expected % for %',expected,statement;
exception when others then
 if sqlstate<>expected then raise; end if;
end;
$$;
set role anon;
select pg_temp.apple_expect($$select public.mile_set_apple_health_consent(true)$$,'42501');
reset role;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
select pg_temp.apple_expect($$select public.mile_set_apple_health_consent(true)$$,'PT403');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';

do $$
declare
 owner uuid := auth.uid();
 other uuid := '00000000-0000-4000-8000-000000000002';
 grant_epoch uuid;
 recorded uuid := '00000000-0000-4000-8000-000000000092';
 key text := 'apple:'||recorded::text;
 today date := (now() at time zone 'UTC')::date-1;
 workout jsonb := jsonb_build_object('id','apple-fixture','sport','Running','date',today,'status','planned','revision',1);
 fixture jsonb := jsonb_build_object('provider','apple_health','provider_id',recorded,'sport','running',
  'start_at',today::text||'T10:00:00Z','end_at',today::text||'T11:00:00Z',
  'duration_seconds',3500,'distance_meters',10000,'average_hr',150,'activity_day',today);
 payload jsonb := jsonb_build_array(fixture);
 request text;
 linked jsonb;
begin
 grant_epoch := (public.mile_set_apple_health_consent(true)->>'epoch')::uuid;
 request := format('select public.mile_commit_apple_health_page(%L,%L,array[]::uuid[])',grant_epoch,payload);
 perform public.mile_commit_apple_health_page(grant_epoch,payload,'{}');
 execute request;
 if (select count(*) from public.mile_device_workouts)<>1 then raise exception 'Duplicate import'; end if;
 perform pg_temp.apple_expect($cmd$delete from public.mile_device_workouts$cmd$,'42501');
 perform pg_temp.apple_expect(format('select public.mile_commit_apple_health_page(%L,%L,array[]::uuid[])',
  grant_epoch,jsonb_build_array(fixture||'{"average_hr":0}'::jsonb)),'PT422');
 perform set_config('request.jwt.claim.sub',other::text,true);
 if exists(select from public.mile_device_workouts) then raise exception 'Cross-account read'; end if;
 perform pg_temp.apple_expect(request,'PT409');
 perform set_config('request.jwt.claim.sub',owner::text,true);

 update public.av_training_data set training_data=jsonb_build_object('workouts',jsonb_build_array(workout)) where user_id=owner;
 linked := public.mile_confirm_running_match('apple-fixture',key,workout,0,'link');
 if linked#>>'{workout,matchId}' is distinct from key or linked#>>'{workout,status}' is distinct from 'done'
 then raise exception 'Apple match not committed'; end if;
 perform pg_temp.apple_expect(format('select public.mile_confirm_running_match(%L,%L,%L,0,%L)',
   'apple-fixture',key,workout,'link'),'PT409');

 perform public.mile_commit_apple_health_page(grant_epoch,'[]',array[recorded]);
 execute request;
 if exists(select from public.mile_device_workouts) then raise exception 'Deleted workout reappeared'; end if;
 linked := public.mile_confirm_running_match('apple-fixture',key,linked->'workout',1,'unlink');
 if linked#>>'{workout,status}' is distinct from 'planned' then raise exception 'Removed source cannot be unlinked'; end if;

 perform public.mile_set_apple_health_consent(false);
 if exists(select from public.mile_device_consents) then raise exception 'Consent was not removed'; end if;
 perform public.mile_set_apple_health_consent(true);
 perform pg_temp.apple_expect(request,'PT409');
end;
$$;
reset role;
select 'Apple Health consent, replay, deletion and owner-bound matching passed';
