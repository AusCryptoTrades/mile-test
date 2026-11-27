-- MILE Staging only. Verifies the deployed RPC with synthetic identities.
-- A stand-in for Garmin ingestion exists only for this rolled-back transaction.
begin;
do $$
begin
 if exists (select from auth.users) or exists (select from public.av_training_data)
   or to_regclass('private.mile_garmin_activities') is not null then
   raise exception 'This proof requires empty staging without live Garmin ingestion';
 end if;
end;
$$;
create table private.mile_garmin_activities (
 user_id uuid not null, garmin_activity_id bigint not null, activity_type text not null,
 started_at timestamptz not null, raw_data jsonb not null, primary key (user_id, garmin_activity_id)
);
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000001','match-one@example.test',now()),
 ('00000000-0000-4000-8000-000000000002','match-two@example.test',now());
insert into public.av_members(user_id) values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into private.mile_garmin_activities values
 ('00000000-0000-4000-8000-000000000001', 1234001, 'RUNNING', now(), '{"startTimeLocal":"2026-11-26T08:00:00"}'),
 ('00000000-0000-4000-8000-000000000002', 1234002, 'RUNNING', now(), '{"startTimeLocal":"2026-11-26T08:00:00"}');
insert into public.av_training_data(user_id,training_data) values
 ('00000000-0000-4000-8000-000000000001','{"workouts":[
  {"id":"synthetic-a","status":"planned","sport":"Running","date":"2026-11-26","matchId":null},
  {"id":"synthetic-b","status":"planned","sport":"Running","date":"2026-11-26","matchId":null}]}');
set local role authenticated;
do $$
declare
  snapshot jsonb;
  receipt jsonb;
begin
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  select training_data into snapshot from public.av_training_data where user_id=auth.uid();
  begin
    perform public.mile_confirm_running_match('synthetic-a','1234002',snapshot#>'{workouts,0}',0);
    raise exception 'Unexpected cross-owner provider link';
  exception when sqlstate 'PT422' then null; end;
  receipt := public.mile_confirm_running_match('synthetic-a','1234001',snapshot#>'{workouts,0}',0);
  if receipt->>'version' is distinct from '1' or receipt#>>'{workout,matchId}' is distinct from '1234001' then
    raise exception 'Match did not commit within transaction';
  end if;
  begin
    update public.av_training_data set training_data=snapshot where user_id=auth.uid();
    raise exception 'Unexpected stale cloud write';
  exception when sqlstate 'PT409' then null; end;
  receipt := public.mile_confirm_running_match('synthetic-a','1234001',receipt->'workout',1,'unlink');
  if receipt->>'version' is distinct from '2' or receipt#>>'{workout,status}' is distinct from 'planned' then
    raise exception 'Unlink failed';
  end if;
end;
$$;
reset role;
select 'Hosted RPC passed synthetic owner, stale-save and unlink checks' as result;
rollback;
