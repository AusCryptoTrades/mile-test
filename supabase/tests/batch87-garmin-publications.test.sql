\set ON_ERROR_STOP on
create schema auth;
create schema private;
create role anon nologin;
create role authenticated nologin;
create table auth.users(id uuid primary key);
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
\ir ../proposals/batch87-garmin-publications.sql
insert into private.mile_garmin_publications(athlete_id,garmin_identity,session_id,revision,scheduled_date,payload_sha256,operation_id)
values ('00000000-0000-4000-8000-000000000001','fixture-garmin','00000000-0000-4000-8000-000000000011',1,'2026-12-01',repeat('a',64),'00000000-0000-4000-8000-000000000021');
do $$
begin
 if has_table_privilege('anon','private.mile_garmin_publications','select') or has_table_privilege('authenticated','private.mile_garmin_publications','insert') or has_table_privilege('authenticated','private.mile_garmin_publications','update') then
  raise exception 'Unexpected client access';
 end if;
 begin
  insert into private.mile_garmin_publications(athlete_id,garmin_identity,session_id,revision,scheduled_date,payload_sha256,operation_id)
  values ('00000000-0000-4000-8000-000000000001','different-garmin','00000000-0000-4000-8000-000000000011',2,'2026-12-02',repeat('b',64),'00000000-0000-4000-8000-000000000022');
  raise exception 'Duplicate publication allowed';
 exception when unique_violation then null; end;
 begin
  update private.mile_garmin_publications set state='verified';
  raise exception 'Verified without IDs allowed';
 exception when check_violation then null; end;
 update private.mile_garmin_publications set state='creating' where state='claimed';
 if not found then raise exception 'Claim failed'; end if;
 update private.mile_garmin_publications set state='creating' where state='claimed';
 if found then raise exception 'Duplicate claim allowed'; end if;
 update private.mile_garmin_publications set state='created',workout_id=123 where state='creating';
 update private.mile_garmin_publications set state='scheduling' where state='created';
 update private.mile_garmin_publications set state='scheduled',schedule_id=456 where state='scheduling';
 update private.mile_garmin_publications set state='verified' where state='scheduled';
 if not found then raise exception 'Verification failed'; end if;
 begin
  insert into private.mile_garmin_publications(athlete_id,garmin_identity,session_id,revision,scheduled_date,payload_sha256,operation_id,state,workout_id,schedule_id)
  values ('00000000-0000-4000-8000-000000000002','fixture-garmin','00000000-0000-4000-8000-000000000012',1,'2026-12-01',repeat('a',64),'00000000-0000-4000-8000-000000000023','verified',123,789);
  raise exception 'Duplicate remote workout allowed';
 exception when unique_violation then null; end;
end $$;
delete from auth.users where id='00000000-0000-4000-8000-000000000001';
do $$ begin if exists(select 1 from private.mile_garmin_publications) then raise exception 'Account deletion cascade failed'; end if; end $$;
