-- Apply after the reviewed Batch 86 device contract and running match migrations.
begin;
alter table public.mile_device_consents
  add column epoch uuid not null default gen_random_uuid(),
  add column last_import_at timestamptz;
alter table public.mile_device_workouts
  add column activity_day date,
  add column average_hr double precision check (average_hr between 20 and 250),
  add column overlap_decision boolean;
create table public.mile_apple_health_tombstones (
 user_id uuid not null,
 provider text not null default 'apple_health' check(provider='apple_health'),
 provider_id uuid not null,
 primary key(user_id,provider_id),
 foreign key(user_id,provider) references public.mile_device_consents(user_id,provider) on delete cascade
);
alter table public.mile_apple_health_tombstones enable row level security;
revoke all on public.mile_apple_health_tombstones from public, anon, authenticated, service_role;
revoke insert,delete,update on public.mile_device_workouts,public.mile_device_consents from authenticated;
revoke update(enabled) on public.mile_device_consents from authenticated;
revoke update(start_at,end_at,duration_seconds,distance_meters,sport) on public.mile_device_workouts from authenticated;

create function mile_running_private.apple_health_owner() returns uuid language plpgsql stable security definer set search_path=''
as $$
declare owner uuid := auth.uid();
begin
 if owner is null or not exists(select from auth.users u where u.id=owner and u.email_confirmed_at is not null
   and not coalesce(u.is_anonymous,false)) or not exists(select from public.av_members m where m.user_id=owner)
 then raise sqlstate 'PT403' using message='Verified membership required'; end if;
 return owner;
end;
$$;
revoke all on function mile_running_private.apple_health_owner() from public, anon, authenticated, service_role;

drop policy workout_read on public.mile_device_workouts;
create policy workout_read on public.mile_device_workouts for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.av_members m where m.user_id=(select auth.uid()))
 and exists(select 1 from public.mile_device_consents c where c.user_id=(select auth.uid()) and c.provider='apple_health' and c.enabled)
);

create function public.mile_set_apple_health_consent(p_enabled boolean) returns jsonb language plpgsql security definer set search_path=''
as $$
declare owner uuid := mile_running_private.apple_health_owner();
 result jsonb;
begin
 if p_enabled is null then raise sqlstate 'PT422' using message='Explicit consent choice required'; end if;
 if not p_enabled then
   delete from public.mile_device_consents where user_id=owner and provider='apple_health';
   return '{"enabled":false}'::jsonb;
 end if;
 insert into public.mile_device_consents(user_id,provider,enabled) values(owner,'apple_health',true)
 on conflict(user_id,provider) do nothing;
 update public.mile_device_consents set enabled=true,epoch=gen_random_uuid()
  where user_id=owner and provider='apple_health' and not enabled;
 select jsonb_build_object('enabled',enabled,'epoch',epoch,'last_import_at',last_import_at) into result
 from public.mile_device_consents c where user_id=owner and provider='apple_health';
 return result;
end;
$$;

create function public.mile_commit_apple_health_page(p_epoch uuid,p_rows jsonb,p_deleted uuid[]) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare owner uuid := mile_running_private.apple_health_owner();
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or p_deleted is null or cardinality(p_deleted)>200
   or array_position(p_deleted,null) is not null then raise sqlstate 'PT422' using message='Invalid page'; end if;
 if jsonb_array_length(p_rows)>200 or octet_length(p_rows::text)>200000
 then raise sqlstate 'PT422' using message='Page too large'; end if;
 -- Lock the exact consent grant until deletions and upserts are durable.
 perform 1 from public.mile_device_consents where user_id=owner and provider='apple_health' and enabled and epoch=p_epoch for update;
 if not found then raise sqlstate 'PT409' using message='Apple Health consent changed'; end if;

 if exists(select from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r) is distinct from 'object' or r->>'provider' is distinct from 'apple_health'
    or not pg_input_is_valid(coalesce(r->>'provider_id',''),'uuid')
    or not pg_input_is_valid(coalesce(r->>'start_at',''),'timestamptz')
    or not pg_input_is_valid(coalesce(r->>'end_at',''),'timestamptz')
    or coalesce(r->>'start_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or coalesce(r->>'end_at','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
    or jsonb_typeof(r->'duration_seconds') is distinct from 'number'
    or coalesce(jsonb_typeof(r->'distance_meters'),'null') not in ('number','null')
    or coalesce(jsonb_typeof(r->'average_hr'),'null') not in ('number','null')
    or (r->>'activity_day' is not null and not pg_input_is_valid(r->>'activity_day','date'))
    or (r->>'sport' is not null and r->>'sport' not in ('running','cycling','swimming','walking','strength')))
 then raise sqlstate 'PT422' using message='Invalid Apple Health workout'; end if;
 if exists(select from jsonb_array_elements(p_rows) r where
   (r->>'start_at')::timestamptz > statement_timestamp()+interval '5 minutes'
   or (r->>'end_at')::timestamptz > statement_timestamp()+interval '5 minutes'
   or (r->>'end_at')::timestamptz < (r->>'start_at')::timestamptz
   or (r->>'duration_seconds')::numeric not between 0 and 2592000
   or (r->>'duration_seconds')::numeric > extract(epoch from ((r->>'end_at')::timestamptz-(r->>'start_at')::timestamptz))+2
   or (r->>'distance_meters')::numeric not between 0 and 10000000
   or (r->>'average_hr')::numeric not between 20 and 250
   or abs((r->>'activity_day')::date-((r->>'start_at')::timestamptz at time zone 'UTC')::date)>1)
 then raise sqlstate 'PT422' using message='Apple Health workout out of range'; end if;

 insert into public.mile_apple_health_tombstones(user_id,provider_id)
 select owner,id from unnest(p_deleted) id on conflict do nothing;
 delete from public.mile_device_workouts where user_id=owner and provider='apple_health' and provider_id=any(p_deleted);
 insert into public.mile_device_workouts(user_id,provider,provider_id,start_at,end_at,duration_seconds,distance_meters,sport,activity_day,average_hr)
 select distinct on (id) owner,'apple_health',id,(r->>'start_at')::timestamptz,(r->>'end_at')::timestamptz,
  (r->>'duration_seconds')::double precision,(r->>'distance_meters')::double precision,r->>'sport',
  (r->>'activity_day')::date,(r->>'average_hr')::double precision
 from jsonb_array_elements(p_rows) with ordinality entry(r,n)
 cross join lateral (select (r->>'provider_id')::uuid id) parsed
 where not exists(select 1 from public.mile_apple_health_tombstones t where t.user_id=owner and t.provider_id=id)
 order by id,n desc
 on conflict(user_id,provider,provider_id) do update set
 start_at=excluded.start_at,end_at=excluded.end_at,duration_seconds=excluded.duration_seconds,
 distance_meters=excluded.distance_meters,sport=excluded.sport,activity_day=excluded.activity_day,
 average_hr=excluded.average_hr;
 update public.mile_device_consents set last_import_at=clock_timestamp() where user_id=owner and provider='apple_health';
 return '{"committed":true}'::jsonb;
end;
$$;

create function public.mile_review_apple_health_overlap(p_workout uuid,p_separate boolean) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare owner uuid := mile_running_private.apple_health_owner();
begin
 if p_separate is null then raise sqlstate 'PT422' using message='Explicit overlap choice required'; end if;
 perform 1 from public.mile_device_consents where user_id=owner and provider='apple_health' and enabled for update;
 if not found then raise sqlstate 'PT409' using message='Apple Health consent changed'; end if;
 update public.mile_device_workouts set overlap_decision=p_separate
 where user_id=owner and provider='apple_health' and provider_id=p_workout;
 if not found then raise sqlstate 'PT404' using message='Workout unavailable'; end if;
 return '{"updated":true}'::jsonb;
end;
$$;
revoke all on function public.mile_set_apple_health_consent(boolean),
 public.mile_commit_apple_health_page(uuid,jsonb,uuid[]),
 public.mile_review_apple_health_overlap(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mile_set_apple_health_consent(boolean),
 public.mile_commit_apple_health_page(uuid,jsonb,uuid[]),
 public.mile_review_apple_health_overlap(uuid,boolean) to authenticated;

-- Extend the existing atomic matcher. Garmin keeps the installed provider lookup.
create or replace function public.mile_confirm_running_match(
  p_workout_id text, p_activity_id text, p_expected_workout jsonb,
  p_expected_version bigint, p_action text default 'link'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb;
  version_now bigint;
  original jsonb;
  revised jsonb;
  workout_index bigint;
  workout_count bigint;
  verified_owner boolean;
begin
  if athlete is null or not exists (select from auth.users where id = athlete
      and email_confirmed_at is not null and not coalesce(is_anonymous, false))
    or not exists (select from public.av_members where user_id = athlete) then
    raise sqlstate 'PT403' using message = 'Verified MILE membership required';
  end if;
  if p_workout_id is null or p_workout_id !~ '^[A-Za-z0-9_.:-]{1,128}$'
    or p_activity_id is null or p_activity_id !~ '^([1-9][0-9]{0,19}|apple:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
    or p_expected_workout is null or p_expected_version is null or p_expected_version < 0
    or p_action is null or p_action not in ('link', 'unlink') then
    raise sqlstate 'PT422' using message = 'Invalid running match request';
  end if;

  select training_data into document from public.av_training_data where user_id = athlete for update;
  if not found or jsonb_typeof(document->'workouts') is distinct from 'array' then
    raise sqlstate 'PT404' using message = 'Your scheduled runs are unavailable';
  end if;
  select coalesce((select version from mile_running_private.manual_match_versions where user_id = athlete), 0)
    into version_now;
  select count(*), min(ordinality) into workout_count, workout_index
    from jsonb_array_elements(document->'workouts') with ordinality w(item, ordinality)
    where item->>'id' = p_workout_id;
  if workout_count <> 1 then
    raise sqlstate 'PT409' using message = 'The scheduled run changed. Reload your plan.';
  end if;
  original := document->'workouts'->((workout_index - 1)::integer);
  if version_now <> p_expected_version or original is distinct from p_expected_workout
    or original->>'sport' is distinct from 'Running'
    or original->>'ownerId' is not null and original->>'ownerId' <> athlete::text
    or original->>'user_id' is not null and original->>'user_id' <> athlete::text then
    raise sqlstate 'PT409' using message = 'The scheduled run changed. Reload your plan.';
  end if;

  if p_action = 'link' then
    if original->>'status' is distinct from 'planned' or original->>'matchId' is not null
      or original->>'completedAt' is not null or original->>'completed_at' is not null
      or exists (select from jsonb_array_elements(document->'workouts') w where w->>'matchId' = p_activity_id) then
      raise sqlstate 'PT409' using message = 'This run or activity is already used. Reload your plan.';
    end if;
    if p_activity_id like 'apple:%' then
      perform 1 from public.mile_device_consents where user_id=athlete and provider='apple_health' and enabled for share;
      verified_owner := found and exists(select 1 from public.mile_device_workouts d
        where d.user_id=athlete and d.provider='apple_health' and d.provider_id=substring(p_activity_id from 7)::uuid
          and d.sport='running' and d.overlap_decision is distinct from false
          and coalesce(d.activity_day,(d.start_at at time zone 'UTC')::date)::text=original->>'date');
    else
    -- Confirm ownership, sport and local day from the private provider row.
    if to_regclass('private.mile_garmin_activities') is null then
      raise sqlstate 'PT503' using message = 'Garmin activity verification is unavailable';
    end if;
    execute $provider$
      select exists (select from private.mile_garmin_activities
        where user_id = $1 and garmin_activity_id::text = $2
          and lower(activity_type) ~ '(running|^virtual_run$|^treadmill$)'
          and coalesce(
            case when raw_data->>'startTimeLocal' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then left(raw_data->>'startTimeLocal', 10) end,
            case when raw_data->>'startTimeOffsetInSeconds' ~ '^-?[0-9]{1,5}$'
                and abs((raw_data->>'startTimeOffsetInSeconds')::integer) <= 50400
              then ((started_at + make_interval(secs => (raw_data->>'startTimeOffsetInSeconds')::integer)) at time zone 'UTC')::date::text end,
            (started_at at time zone 'UTC')::date::text) = $3)
    $provider$ into verified_owner using athlete, p_activity_id, original->>'date';
    end if;
    if not verified_owner
      or coalesce(original->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or original->>'date' > ((now() at time zone interval '+14:00')::date)::text then
      raise sqlstate 'PT422' using message = 'This recording cannot be matched to the selected run';
    end if;
    revised := original || jsonb_build_object('matchId', p_activity_id, 'status', 'done');
  else
    if original->>'matchId' is distinct from p_activity_id or original->>'status' is distinct from 'done' then
      raise sqlstate 'PT409' using message = 'This link has already changed';
    end if;
    revised := original || jsonb_build_object('matchId', null::text, 'status', 'planned');
  end if;

  insert into mile_running_private.manual_match_versions (user_id, version)
    values (athlete, version_now + 1) on conflict (user_id) do update set version = excluded.version;
  if p_action = 'link' then
    insert into mile_running_private.manual_matches (user_id, workout_id, activity_id)
      values (athlete, p_workout_id, p_activity_id);
  else
    delete from mile_running_private.manual_matches where user_id = athlete and workout_id = p_workout_id;
  end if;
  update public.av_training_data set
    training_data = jsonb_set(jsonb_set(document, array['workouts', (workout_index - 1)::text], revised),
      '{runningMatchVersion}', to_jsonb(version_now + 1)),
    updated_at = clock_timestamp()
  where user_id = athlete;
  return jsonb_build_object('version', version_now + 1, 'workout', revised, 'action', p_action);
end;
$$;
revoke all on function public.mile_confirm_running_match(text, text, jsonb, bigint, text) from public, anon, service_role;
grant execute on function public.mile_confirm_running_match(text, text, jsonb, bigint, text) to authenticated;
commit;
