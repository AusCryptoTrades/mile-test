-- The same sport adapter computes the review and the committed prescription.
create function mile_running_private.reduce_aerobic_workout(
  original jsonb, old_revision integer, p_distance_factor numeric
) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  revised jsonb;
  old_meters numeric;
  old_seconds numeric;
  step jsonb;
  target jsonb;
  target_low numeric;
  target_high numeric;
  target_text text;
  step_label text;
  step_meters numeric;
  resized_meters numeric;
  total_before numeric := 0;
  total_after numeric := 0;
  seconds_after numeric;
  revised_steps jsonb := '[]'::jsonb;
  detail_parts text[] := '{}';
begin
  if original->'runningPlanVersion' is distinct from '1'::jsonb
    or coalesce(original->>'kind', '') not in ('easy', 'recovery', 'long', 'taper', 'return', 'ultra')
    or jsonb_typeof(original->'detail') is distinct from 'string'
    or original->'structuredDetail' is distinct from original->'detail'
    or jsonb_typeof(original->'structuredSteps') is distinct from 'array'
    or jsonb_typeof(original->'meters') is distinct from 'number'
    or jsonb_typeof(original->'km') is distinct from 'number'
    or jsonb_typeof(original->'estimatedSeconds') is distinct from 'number'
    or jsonb_typeof(original->'plannedMinutes') is distinct from 'number' then
    raise sqlstate 'PT422' using message = 'Only canonical aerobic running workouts support distance reduction';
  end if;
  old_meters := (original->>'meters')::numeric;
  old_seconds := (original->>'estimatedSeconds')::numeric;
  if old_meters <= 0 or old_seconds <= 0
    or abs((original->>'km')::numeric * 1000 - old_meters) > 1
    or (original->>'plannedMinutes')::numeric <> ceil(old_seconds / 60)
    or jsonb_array_length(original->'structuredSteps') not between 1 and 200 then
    raise sqlstate 'PT422' using message = 'Invalid stored workout totals';
  end if;

  for step in select value from jsonb_array_elements(original->'structuredSteps') loop
    if step->>'kind' is distinct from 'step'
      or coalesce(step->>'intensity', '') not in ('warmup', 'active', 'cooldown')
      or step#>>'{duration,kind}' is distinct from 'distance'
      or jsonb_typeof(step#>'{duration,meters}') is distinct from 'number' then
      raise sqlstate 'PT422' using message = 'Only flat aerobic distance steps can be revised';
    end if;
    step_meters := (step#>>'{duration,meters}')::numeric;
    resized_meters := floor(step_meters * p_distance_factor / 100) * 100;
    if resized_meters < 100 then
      raise sqlstate 'PT422' using message = 'A revised step would be shorter than 100 metres';
    end if;

    target := step->'target';
    case target->>'kind'
      when 'open' then
        target_text := 'effort-based';
      when 'pace' then
        if jsonb_typeof(target->'fastSecondsPerKm') is distinct from 'number'
          or jsonb_typeof(target->'slowSecondsPerKm') is distinct from 'number' then
          raise sqlstate 'PT422' using message = 'Invalid stored running pace target';
        end if;
        target_low := (target->>'fastSecondsPerKm')::numeric;
        target_high := (target->>'slowSecondsPerKm')::numeric;
        if target_low < 120 or target_high > 1800 or target_low > target_high then
          raise sqlstate 'PT422' using message = 'Invalid stored running pace target';
        end if;
        target_text := ltrim(to_char(make_interval(secs => round(target_low)::double precision), 'MI:SS'), '0')
          || '–' || ltrim(to_char(make_interval(secs => round(target_high)::double precision), 'MI:SS'), '0') || '/km';
      when 'heart_rate' then
        if jsonb_typeof(target->'lowBpm') is distinct from 'number'
          or jsonb_typeof(target->'highBpm') is distinct from 'number' then
          raise sqlstate 'PT422' using message = 'Invalid stored running heart-rate target';
        end if;
        target_low := (target->>'lowBpm')::numeric;
        target_high := (target->>'highBpm')::numeric;
        if target_low < 30 or target_high > 250 or target_low >= target_high
          or target_low <> trunc(target_low) or target_high <> trunc(target_high) then
          raise sqlstate 'PT422' using message = 'Invalid stored running heart-rate target';
        end if;
        target_text := target_low::integer || '–' || target_high::integer || ' bpm';
      else
        raise sqlstate 'PT422' using message = 'Unsupported running step target';
    end case;

    step_label := case step->>'intensity' when 'warmup' then 'Warm-up' when 'cooldown' then 'Cooldown' else 'Main' end;
    total_before := total_before + step_meters;
    total_after := total_after + resized_meters;
    revised_steps := revised_steps || jsonb_build_array(jsonb_set(step, '{duration,meters}', to_jsonb(resized_meters)));
    detail_parts := array_append(detail_parts,
      step_label || ': ' || (resized_meters / 1000)::numeric(20,1)::text || ' km · ' || target_text || '.');
  end loop;
  if total_before <> old_meters or total_after < old_meters * 0.8 or total_after >= old_meters then
    raise sqlstate 'PT422' using message = 'The revised total must be a reduction of no more than 20 percent';
  end if;

  seconds_after := ceil(old_seconds * total_after / old_meters);
  revised := original || jsonb_build_object(
    'revision', old_revision + 1, 'meters', total_after, 'km', total_after / 1000,
    'estimatedSeconds', seconds_after, 'plannedMinutes', ceil(seconds_after / 60),
    'structuredSteps', revised_steps, 'detail', array_to_string(detail_parts, ' '),
    'structuredDetail', array_to_string(detail_parts, ' ')
  );

  return revised;
end;
$$;
revoke all on function mile_running_private.reduce_aerobic_workout(jsonb, integer, numeric)
  from public, anon, authenticated, service_role;

create or replace function mile_running_private.revise_workout(
  p_workout_id text, p_expected_revision integer, p_event_id text, p_distance_factor numeric, p_expected_workout jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb;
  previous_event mile_running_private.workout_revisions%rowtype;
  workout_index integer;
  workout_count integer;
  original jsonb;
  revised jsonb;
  old_revision integer;
begin
  if athlete is null or not exists (select 1 from public.av_members where user_id = athlete) then
    raise sqlstate 'PT403' using message = 'MILE membership required';
  end if;
  if p_workout_id is null or p_workout_id !~ '^[a-z0-9_.-]{1,128}$'
    or p_event_id is null or p_event_id !~ '^[A-Za-z0-9_.:-]{1,200}$'
    or p_expected_revision is null or p_expected_revision < 1
    or p_distance_factor is null or p_distance_factor < 0.8 or p_distance_factor >= 1 then
    raise sqlstate 'PT422' using message = 'Invalid running revision request';
  end if;

  select training_data into document
  from public.av_training_data
  where user_id = athlete
  for update;

  if not found then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;

  select * into previous_event
  from mile_running_private.workout_revisions
  where user_id = athlete and event_id = p_event_id;
  if found then
    if previous_event.workout_id <> p_workout_id
      or previous_event.from_revision <> p_expected_revision
      or previous_event.distance_factor <> p_distance_factor
      or previous_event.before_workout is distinct from p_expected_workout then
      raise sqlstate 'PT409' using message = 'Adaptation event has already been used';
    end if;
    return jsonb_build_object('status', 'duplicate', 'workoutId', p_workout_id, 'revision', previous_event.to_revision);
  end if;

  if jsonb_typeof(document->'workouts') is distinct from 'array' then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;
  select count(*), min(ordinality)::integer - 1 into workout_count, workout_index
  from jsonb_array_elements(document->'workouts') with ordinality as w(workout, ordinality)
  where workout->>'id' = p_workout_id;
  if workout_count <> 1 then
    raise sqlstate 'PT404' using message = 'Planned running workout unavailable';
  end if;

  original := document->'workouts'->workout_index;
  if original->>'sport' is distinct from 'Running'
    or original->>'status' is distinct from 'planned'
    or original->>'matchId' is not null or original->>'completedAt' is not null
    or coalesce(original->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(original->>'date', 'date') then
    raise sqlstate 'PT409' using message = 'Only future, unmatched planned runs can be revised';
  end if;
  -- Calendar dates carry no timezone. Require a future date even in UTC+14.
  if (original->>'date')::date <= (clock_timestamp() at time zone interval '+14:00')::date then
    raise sqlstate 'PT409' using message = 'Only future, unmatched planned runs can be revised';
  end if;

  select coalesce((
    select to_revision from mile_running_private.workout_revisions
    where user_id = athlete and workout_id = p_workout_id
    order by to_revision desc limit 1
  ), 1) into old_revision;
  if old_revision <> p_expected_revision or old_revision = 2147483647
    or original->'revision' is distinct from to_jsonb(old_revision)
    or original is distinct from p_expected_workout then
    raise sqlstate 'PT409' using message = 'Workout changed since review';
  end if;

  -- Garmin session IDs are UUIDs. Text comparison also covers restored backups
  -- without letting a malformed ID cause a cast error in the publication lookup.
  if pg_input_is_valid(p_workout_id, 'uuid') and exists (
    select 1 from private.mile_garmin_publications
    where athlete_id = athlete
      and session_id = case when pg_input_is_valid(p_workout_id, 'uuid') then p_workout_id::uuid end
  ) then
    raise sqlstate 'PT409' using message = 'This Garmin workout requires publication reconciliation before revision';
  end if;

  revised := mile_running_private.reduce_aerobic_workout(original, old_revision, p_distance_factor);

  insert into mile_running_private.workout_revisions
    (user_id, workout_id, event_id, from_revision, to_revision, before_workout, after_workout, distance_factor)
  values (athlete, p_workout_id, p_event_id, old_revision, old_revision + 1, original, revised, p_distance_factor);

  update public.av_training_data
  set training_data = jsonb_set(document, array['workouts', workout_index::text], revised),
      updated_at = clock_timestamp()
  where user_id = athlete;

  return jsonb_build_object('status', 'applied', 'workoutId', p_workout_id, 'revision', old_revision + 1);
end;
$$;
-- Keep the original published migration intact. Its writer is now internal.
revoke execute on function public.mile_revise_running_workout(text, integer, text, numeric, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function mile_running_private.revise_workout(text, integer, text, numeric, jsonb)
  from public, anon, authenticated, service_role;

create schema mile_training_private;
revoke all on schema mile_training_private from public, anon, authenticated, service_role;
grant usage on schema mile_training_private to authenticated;

create table mile_training_private.revision_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sport text not null,
  policy text not null,
  evidence_day date not null,
  evidence jsonb not null,
  before_workout jsonb not null,
  after_workout jsonb not null,
  operation jsonb not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > issued_at),
  approved_at timestamptz,
  receipt jsonb,
  check ((approved_at is null) = (receipt is null))
);
create index mile_revision_proposals_owner_day
  on mile_training_private.revision_proposals (user_id, sport, policy, evidence_day);
create unique index mile_revision_one_approval_per_evidence_day
  on mile_training_private.revision_proposals (user_id, sport, policy, evidence_day)
  where approved_at is not null;
create unique index mile_revision_one_approval_per_workout
  on mile_training_private.revision_proposals (user_id, sport, policy, (before_workout->>'id'))
  where approved_at is not null;
alter table mile_training_private.revision_proposals enable row level security;
revoke all on mile_training_private.revision_proposals from public, anon, authenticated, service_role;

-- Shared ownership and lock order for all sport adapters.
create function mile_training_private.lock_document(athlete uuid) returns jsonb
language plpgsql set search_path = ''
as $$
declare document jsonb;
begin
  if athlete is null or athlete is distinct from auth.uid()
    or not exists (select 1 from public.av_members where user_id = athlete) then
    raise sqlstate 'PT403' using message = 'MILE membership required';
  end if;
  select training_data into document from public.av_training_data where user_id = athlete for update;
  if not found then
    raise sqlstate 'PT404' using message = 'Training data unavailable';
  end if;
  return document;
end;
$$;
revoke all on function mile_training_private.lock_document(uuid) from public, anon, authenticated, service_role;

-- Running's first policy reads explicitly self-reported evidence from the
-- authenticated athlete's saved check-in. It never interprets files or Garmin data.
create function mile_running_private.recovery_proposal(athlete uuid, document jsonb, evaluated_at timestamptz)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  evidence_day date;
  calendar_cutoff date := (evaluated_at at time zone interval '+14:00')::date;
  earliest_checkin date := (evaluated_at at time zone interval '-12:00')::date;
  fatigue text;
  current_block text := document->>'activeBlock';
  workout jsonb;
  expected_revision integer;
  factor constant numeric := 0.90;
begin
  -- Calendar check-ins store local dates and no zone. Use the latest check-in
  -- on a date currently in use anywhere, including a newer low-fatigue entry.
  select d.day, document#>>array['checkins',d.day::text,'fatigue']
    into evidence_day, fatigue
  from generate_series(0,calendar_cutoff-earliest_checkin) as offsets(days)
  cross join lateral (select earliest_checkin+offsets.days as day) as d
  where document#>array['checkins',d.day::text] is not null
  order by d.day desc limit 1;

  if coalesce(fatigue, '') !~ '^(7|8|9|10)$' or current_block is null
    or jsonb_typeof(document->'blocks') is distinct from 'array'
    or jsonb_typeof(document->'workouts') is distinct from 'array'
    or not exists (
      select 1 from jsonb_array_elements(document->'blocks') b
      where b->>'id' = current_block and b->>'sport' = 'Running'
        and b->'calendarVisible' is distinct from 'false'::jsonb
        and b#>'{runningPlan,config,adaptation,recovery}' = 'true'::jsonb
        and b#>'{runningPlan,config,athlete,injury}' is distinct from 'true'::jsonb
    ) then
    return null;
  end if;

  select w into workout
  from jsonb_array_elements(document->'workouts') as entries(w)
  where w->>'block' = current_block and w->>'sport' = 'Running' and w->>'status' = 'planned'
    and w->>'matchId' is null and w->>'completedAt' is null
    and w->>'date' > calendar_cutoff::text and w->>'date' <= (calendar_cutoff+7)::text
  order by w->>'date', w->>'id' limit 1;

  if workout is null or coalesce(workout->>'kind', '') not in ('easy','recovery','long','taper','ultra')
    or coalesce(workout->>'id', '') !~ '^[a-z0-9_.-]{1,128}$'
    or coalesce(workout->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or not pg_input_is_valid(workout->>'date', 'date')
    or jsonb_typeof(workout->'revision') is distinct from 'number'
    or not pg_input_is_valid(workout->>'revision', 'integer')
    or (select count(*) from jsonb_array_elements(document->'workouts') w where w->>'id'=workout->>'id') <> 1
    or exists (
      select 1 from private.mile_garmin_publications
      where athlete_id = athlete
        and session_id = case when pg_input_is_valid(workout->>'id','uuid') then (workout->>'id')::uuid end
    ) then
    return null;
  end if;

  expected_revision := coalesce((
    select to_revision from mile_running_private.workout_revisions
    where user_id = athlete and workout_id = workout->>'id'
    order by to_revision desc limit 1
  ), 1);
  if expected_revision = 2147483647 or workout->'revision' is distinct from to_jsonb(expected_revision) then
    return null;
  end if;

  return jsonb_build_object(
    'policy','running-recovery-v1','evidenceDay',evidence_day,
    'evidence',jsonb_build_object('source','athlete-checkin','fatigue',fatigue::integer,'date',evidence_day),
    'before',workout,'after',mile_running_private.reduce_aerobic_workout(workout,expected_revision,factor),
    'operation',jsonb_build_object('type','reduce-distance','factor',factor)
  );
exception when sqlstate 'PT422' then
  -- Unsupported prescriptions can still be reviewed by the athlete.
  return null;
end;
$$;
revoke all on function mile_running_private.recovery_proposal(uuid, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

create function mile_training_private.evaluate_revision(
  athlete uuid, sport text, document jsonb, evaluated_at timestamptz
) returns jsonb language plpgsql set search_path = ''
as $$
begin
  case sport
    when 'Running' then return mile_running_private.recovery_proposal(athlete, document, evaluated_at);
    else raise sqlstate 'PT422' using message = 'No revision policy is available for this sport';
  end case;
end;
$$;
revoke all on function mile_training_private.evaluate_revision(uuid, text, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

create function mile_training_private.review_revision(p_sport text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb := mile_training_private.lock_document(athlete);
  evaluated_at timestamptz := clock_timestamp();
  candidate jsonb := mile_training_private.evaluate_revision(athlete, p_sport, document, evaluated_at);
  proposal mile_training_private.revision_proposals%rowtype;
begin
  if candidate is null then return jsonb_build_object('status','unavailable'); end if;

  select * into proposal from mile_training_private.revision_proposals
  where user_id=athlete and sport=p_sport and policy=candidate->>'policy'
    and (
      (approved_at is not null and (evidence_day=(candidate->>'evidenceDay')::date
        or before_workout->>'id'=candidate#>>'{before,id}'))
      or (approved_at is null and expires_at>evaluated_at and evidence=candidate->'evidence'
        and before_workout=candidate->'before' and after_workout=candidate->'after')
    )
  order by approved_at desc nulls last, issued_at desc limit 1;

  if proposal.approved_at is not null then return jsonb_build_object('status','already-applied'); end if;
  if not found then
    insert into mile_training_private.revision_proposals
      (user_id,sport,policy,evidence_day,evidence,before_workout,after_workout,operation,issued_at,expires_at)
    values (athlete,p_sport,candidate->>'policy',(candidate->>'evidenceDay')::date,candidate->'evidence',
      candidate->'before',candidate->'after',candidate->'operation',evaluated_at,evaluated_at+interval '20 minutes')
    returning * into proposal;
  end if;

  return jsonb_build_object('status','review','id',proposal.id,'sport',proposal.sport,'policy',proposal.policy,
    'expiresAt',proposal.expires_at,'evidence',proposal.evidence,
    'before',proposal.before_workout,'after',proposal.after_workout);
end;
$$;

create function mile_training_private.approve_revision(p_proposal_id uuid, p_approved boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb := mile_training_private.lock_document(athlete);
  evaluated_at timestamptz := clock_timestamp();
  proposal mile_training_private.revision_proposals%rowtype;
  candidate jsonb;
  result jsonb;
begin
  if p_approved is distinct from true then
    raise sqlstate 'PT422' using message = 'Explicit athlete approval required';
  end if;
  select * into proposal from mile_training_private.revision_proposals
  where id=p_proposal_id and user_id=athlete;
  if not found then raise sqlstate 'PT404' using message = 'Training proposal unavailable'; end if;
  if proposal.approved_at is not null then return proposal.receipt || '{"status":"duplicate"}'::jsonb; end if;
  if proposal.expires_at<=evaluated_at or exists (
    select 1 from mile_training_private.revision_proposals
    where user_id=athlete and sport=proposal.sport and policy=proposal.policy
      and approved_at is not null and (evidence_day=proposal.evidence_day
        or before_workout->>'id'=proposal.before_workout->>'id')
  ) then raise sqlstate 'PT409' using message = 'Training proposal expired or already applied'; end if;

  candidate := mile_training_private.evaluate_revision(athlete, proposal.sport, document, evaluated_at);
  if candidate->>'policy' is distinct from proposal.policy
    or (candidate->>'evidenceDay')::date is distinct from proposal.evidence_day
    or candidate->'evidence' is distinct from proposal.evidence
    or candidate->'before' is distinct from proposal.before_workout
    or candidate->'after' is distinct from proposal.after_workout
    or candidate->'operation' is distinct from proposal.operation then
    raise sqlstate 'PT409' using message = 'Training evidence or workout changed since review';
  end if;

  case proposal.sport
    when 'Running' then result := mile_running_private.revise_workout(
      proposal.before_workout->>'id',(proposal.before_workout->>'revision')::integer,
      'proposal:'||proposal.id::text,(proposal.operation->>'factor')::numeric,proposal.before_workout);
    else raise sqlstate 'PT422' using message = 'No revision writer is available for this sport';
  end case;

  update mile_training_private.revision_proposals
  set approved_at=evaluated_at, receipt=result where id=proposal.id;
  return result;
end;
$$;

revoke all on function mile_training_private.review_revision(text),
  mile_training_private.approve_revision(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function mile_training_private.review_revision(text),
  mile_training_private.approve_revision(uuid,boolean) to authenticated;

create function public.mile_review_training_revision(p_sport text) returns jsonb
language sql security invoker set search_path = ''
as $$ select mile_training_private.review_revision(p_sport) $$;
create function public.mile_approve_training_revision(p_proposal_id uuid,p_approved boolean) returns jsonb
language sql security invoker set search_path = ''
as $$ select mile_training_private.approve_revision(p_proposal_id,p_approved) $$;
revoke all on function public.mile_review_training_revision(text),
  public.mile_approve_training_revision(uuid,boolean) from public, anon, authenticated, service_role;
grant execute on function public.mile_review_training_revision(text),
  public.mile_approve_training_revision(uuid,boolean) to authenticated;
