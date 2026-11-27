\set ON_ERROR_STOP on
begin;
create schema if not exists auth;
create schema if not exists private;
create table auth.users(id uuid primary key);
do $$ begin
 if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
\ir ../proposals/batch875-fit-jobs.sql
insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into private.mile_fit_jobs(user_id,activity_id,garmin_user_id,summary_id,start_epoch,encrypted_callback) values
('00000000-0000-4000-8000-000000000001','12345678','owner','fixture',1795730000,'encrypted'),
('00000000-0000-4000-8000-000000000002','12345678','other','fixture',1795730000,'encrypted');
do $$
begin
 if has_table_privilege('anon','private.mile_fit_jobs','select') or has_table_privilege('authenticated','private.mile_fit_jobs','select') then raise exception 'private FIT queue exposed'; end if;
 if not (select relrowsecurity from pg_class where oid='private.mile_fit_jobs'::regclass) then raise exception 'RLS disabled';end if;
 begin
  update private.mile_fit_jobs set state='ready' where activity_id='12345678';
  raise exception 'invalid ready state accepted';
 exception when check_violation then null;end;
 begin
  insert into private.mile_fit_jobs(user_id,activity_id,garmin_user_id,summary_id,start_epoch,encrypted_callback) values ('00000000-0000-4000-8000-000000000001','12345678','owner','fixture',1795730000,'duplicate');
  raise exception 'duplicate accepted';
 exception when unique_violation then null;end;
end $$;
rollback;
