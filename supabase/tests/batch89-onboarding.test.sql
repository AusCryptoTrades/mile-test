\set ON_ERROR_STOP on
create function pg_temp.expect_state(command text, code text) returns void language plpgsql as $$
begin
  execute command;
  raise exception 'Expected SQLSTATE % for %',code,command;
exception when others then
  if sqlstate<>code then raise; end if;
end;
$$;

set role anon;
select pg_temp.expect_state('select public.mile_onboarding_state()','42501');
reset role;

set role authenticated;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000005';
select pg_temp.expect_state('select public.mile_onboarding_state()','PT403');
select pg_temp.expect_state($$select public.av_join('FIXTURE-ONE')$$,'P0001');
select pg_temp.expect_state($$insert into public.mile_profiles(user_id,username,display_name) values(auth.uid(),'not_invited','Uninvited')$$,'42501');
select pg_temp.expect_state($$insert into storage.objects values('mile-avatars',auth.uid()::text||'/avatar.jpg')$$,'42501');

set request.jwt.claim.sub='89000000-0000-4000-8000-000000000004';
select pg_temp.expect_state($$select public.av_join('FIXTURE-ONE')$$,'P0001');

set request.jwt.claim.sub='89000000-0000-4000-8000-000000000001';
do $$
begin
 if public.mile_onboarding_state()->>'stage' is not null then raise exception 'Legacy athlete was enrolled'; end if;
 if not (select auto_share_activities from public.mile_profiles where user_id=auth.uid()) then raise exception 'Legacy sharing changed'; end if;
end;
$$;
select pg_temp.expect_state($$select public.mile_onboarding_save(1,0,'{}')$$,'PT409');
insert into public.mile_profiles(user_id,username,display_name)
values(auth.uid(),'admin','Legacy athlete') on conflict(user_id) do update set username=excluded.username;

set request.jwt.claim.sub='89000000-0000-4000-8000-000000000002';
select public.av_join('FIXTURE-ONE');
select pg_temp.expect_state($$update public.av_members set onboarding_stage=6 where user_id=auth.uid()$$,'42501');
select pg_temp.expect_state($$select public.mile_onboarding_save(2,0,'{}')$$,'PT422');
select pg_temp.expect_state($$select public.mile_onboarding_save(1,0,'{"username":"Admin_help","display_name":"Athlete"}')$$,'PT422');
select pg_temp.expect_state($$insert into storage.objects values('mile-avatars','89000000-0000-4000-8000-000000000003/avatar.jpg')$$,'42501');
select pg_temp.expect_state($$select public.mile_onboarding_save(1,0,'{"username":"alpha","display_name":"Athlete","avatar_url":"https://example.com/avatar.jpg"}')$$,'PT422');

do $$
declare reply jsonb;
begin
  reply:=public.mile_onboarding_save(1,0,'{"username":"ALPHA","display_name":"First athlete"}');
  if reply#>>'{profile,username}'<>'alpha' or reply->>'stage'<>'2' then raise exception 'First stage failed'; end if;
  if (select auto_share_activities or is_discoverable or not is_private from public.mile_profiles where user_id=auth.uid()) then
    raise exception 'Wrong defaults';
  end if;
end;
$$;
select pg_temp.expect_state($$select public.mile_onboarding_save(1,0,'{"username":"second","display_name":"Changed"}')$$,'PT409');
select pg_temp.expect_state($$select public.mile_onboarding_save(2,1,'{"disciplines":["Running"],"primary_sport":"Triathlon"}')$$,'PT422');
select public.mile_onboarding_save(2,1,'{"disciplines":["Running","Triathlon"],"primary_sport":"Triathlon"}')->>'stage';
select pg_temp.expect_state($$select public.mile_onboarding_save(3,2,'{"heightCm":600,"units":"metric"}')$$,'PT422');
select public.mile_onboarding_save(3,2,'{"heightCm":175,"weightKg":null,"experience":"regular","units":"imperial"}')->>'stage';
select public.mile_onboarding_save(4,3,'{}')->>'stage';

set request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
select public.av_join('FIXTURE-TWO');
select pg_temp.expect_state($$select public.mile_onboarding_save(1,0,'{"username":"Alpha","display_name":"Second athlete"}')$$,'PT409');
do $$
begin
 if public.mile_onboarding_username('Alpha') then raise exception 'Case-insensitive conflict missed'; end if;
 if exists(select from public.mile_profiles where username='alpha') then raise exception 'Private profile visible'; end if;
 if exists(select from public.av_training_data where user_id='89000000-0000-4000-8000-000000000002') then raise exception 'Private training visible'; end if;
 update public.mile_profiles set display_name='Tampered' where username='alpha';
 if found then raise exception 'Cross-account update succeeded'; end if;
end;
$$;

set request.jwt.claim.sub='89000000-0000-4000-8000-000000000002';
select public.mile_onboarding_save(5,4,'{"is_private":false}')->>'stage';
select pg_temp.expect_state($$select public.mile_onboarding_save(5,5,'{"is_private":true}')$$,'PT409');
select pg_temp.expect_state($$update public.av_training_data set training_data=jsonb_set(training_data,'{settings,athleteProfile,weightKg}','500') where user_id=auth.uid()$$,'PT422');
do $$
declare doc jsonb;
begin
 select training_data into strict doc from public.av_training_data where user_id=auth.uid();
 if doc#>>'{settings,preferences776,appearance,distance}'<>'mi'
  or doc#>'{settings,athleteProfile,weightKg}' is not null or doc->'workouts'<>'[]'::jsonb
  or not exists(select from public.av_members where user_id=auth.uid() and onboarding_stage=6 and onboarded_at is not null) then
   raise exception 'Completion did not commit the expected private profile';
 end if;
end;
$$;
set request.jwt.claim.sub='89000000-0000-4000-8000-000000000003';
do $$
begin
 if not exists(select from public.mile_profiles where username='alpha' and primary_sport='Triathlon'
    and not is_private and not auto_share_activities) then raise exception 'Public choice not enforced'; end if;
 if exists(select from public.av_training_data where user_id='89000000-0000-4000-8000-000000000002') then raise exception 'Private data leaked through public profile'; end if;
end;
$$;
reset role;

set role service_role;
update public.av_training_data
set training_data=jsonb_set(training_data,'{settings,athleteProfile,heightCm}','171')
where user_id='89000000-0000-4000-8000-000000000001';
select pg_temp.expect_state('select public.mile_onboarding_state()','42501');
reset role;

-- Two independent sessions submit the same onboarding revision.
create extension dblink;
select dblink_connect('other_device',format('host=127.0.0.1 port=%s dbname=%s user=postgres application_name=mile_onboarding_test',
  current_setting('port'),current_database()));
select dblink_exec('other_device',$$set role authenticated; set request.jwt.claim.sub='89000000-0000-4000-8000-000000000003'$$);
begin;
set local role authenticated;
select public.mile_onboarding_save(1,0,'{"username":"second_athlete","display_name":"Second athlete"}')->>'stage';
select dblink_send_query('other_device',$$select public.mile_onboarding_save(
  1,0,'{"username":"stale_copy","display_name":"Stale copy"}')$$);
reset role;
do $$
declare deadline timestamptz:=clock_timestamp()+interval '10 seconds';
begin
 loop
  perform pg_stat_clear_snapshot();
  exit when exists(select 1 from pg_stat_activity where application_name='mile_onboarding_test' and wait_event_type='Lock');
  if clock_timestamp()>deadline then raise exception 'Concurrent save never waited for membership lock'; end if;
  perform pg_sleep(.02);
 end loop;
end;
$$;
commit;
do $$
begin
 perform * from dblink_get_result('other_device',false) as r(reply jsonb);
 if found or dblink_error_message('other_device') not like '%Profile setup has changed%' then
  raise exception 'Concurrent onboarding revision was not rejected';
 end if;
 if (select username from public.mile_profiles where user_id='89000000-0000-4000-8000-000000000003') is distinct from 'second_athlete' then
  raise exception 'Concurrent request replaced the identity';
 end if;
end;
$$;
select dblink_disconnect('other_device');

\ir ../migrations/20261127084450_athlete_onboarding.sql
do $$
begin
 if not exists(select from public.av_members where user_id='89000000-0000-4000-8000-000000000002'
     and onboarding_stage=6 and onboarding_revision=5 and onboarded_at is not null) then
   raise exception 'Reapplying migration changed completed setup';
 end if;
 if not exists(select from public.av_members where user_id='89000000-0000-4000-8000-000000000001'
     and onboarding_stage is null) then raise exception 'Reapplying migration enrolled an existing athlete'; end if;
end;
$$;
