-- Run against disposable CI database only after fixtures and proposal.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.mile_device_consents(provider,enabled) values('apple_health',false);
do $$begin
 begin
  insert into public.mile_device_workouts(provider,provider_id,start_at,end_at,duration_seconds) values('apple_health','00000000-0000-4000-8000-000000000011','2026-11-01 00:00Z','2026-11-01 01:00Z',3600);
  raise exception 'Consent bypass';
 exception when insufficient_privilege then null; end;
end$$;
update public.mile_device_consents set enabled=true;
insert into public.mile_device_workouts(provider,provider_id,start_at,end_at,duration_seconds) values('apple_health','00000000-0000-4000-8000-000000000011','2026-11-01 00:00Z','2026-11-01 01:00Z',3600)
on conflict(user_id,provider,provider_id) do update set duration_seconds=excluded.duration_seconds;
insert into public.mile_device_workouts(provider,provider_id,start_at,end_at,duration_seconds) values('apple_health','00000000-0000-4000-8000-000000000011','2026-11-01 00:00Z','2026-11-01 01:00Z',3601)
on conflict(user_id,provider,provider_id) do update set duration_seconds=excluded.duration_seconds;
do $$begin
 if (select count(*) from public.mile_device_workouts)<>1 then raise exception 'Replay created duplicate';end if;
 if (select duration_seconds from public.mile_device_workouts)<>3601 then raise exception 'Replay update failed';end if;
 if (select distance_meters from public.mile_device_workouts) is not null then raise exception 'Missing distance changed';end if;
 begin
  update public.mile_device_workouts set duration_seconds=-1;
  raise exception 'Invalid metric accepted';
 exception when check_violation then null;end;
 begin
  update public.mile_device_workouts set user_id='00000000-0000-4000-8000-000000000002';
  raise exception 'Ownership reassignment accepted';
 exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$begin
 if exists(select 1 from public.mile_device_workouts) then raise exception 'Cross-account read';end if;
 if exists(select 1 from public.mile_device_consents) then raise exception 'Cross-account consent read';end if;
 begin
  insert into public.mile_device_workouts(user_id,provider,provider_id,start_at,end_at,duration_seconds) values('00000000-0000-4000-8000-000000000001','apple_health','00000000-0000-4000-8000-000000000012','2026-11-01 00:00Z','2026-11-01 01:00Z',3600);
  raise exception 'Cross-account write';
 exception when insufficient_privilege then null;end;
 delete from public.mile_device_workouts;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$begin
 begin
  insert into public.mile_device_consents(provider,enabled) values('apple_health',true);
  raise exception 'Nonmember consent accepted';
 exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$begin
 if (select count(*) from public.mile_device_workouts)<>1 then raise exception 'Other user deleted workout';end if;
end$$;
update public.mile_device_consents set enabled=false;
do $$begin
 begin
  update public.mile_device_workouts set duration_seconds=10;
  raise exception 'Revoked consent bypass';
 exception when insufficient_privilege then null;end;
end$$;
delete from public.mile_device_consents;
do $$begin
 if exists(select 1 from public.mile_device_workouts) then raise exception 'Disconnect purge failed';end if;
end$$;
reset role;
set local role anon;
do $$begin
 begin
  perform 1 from public.mile_device_workouts;
  raise exception 'Anonymous access';
 exception when insufficient_privilege then null;end;
end$$;
rollback;
