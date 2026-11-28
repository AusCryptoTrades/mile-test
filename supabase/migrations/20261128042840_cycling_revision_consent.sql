-- The approved delta has an exact timed origin. Reject malformed or edited
-- non-canonical workouts, including excessive repeat counts and durations.
create function mile_training_private.cycling_timed_seconds(steps jsonb, nesting integer default 0)
returns integer language plpgsql immutable set search_path = ''
as $$
declare
  step jsonb;
  total integer := 0;
  seconds integer;
  repeats integer;
begin
  if jsonb_typeof(steps) is distinct from 'array' or nesting > 1 then return null; end if;
  if jsonb_array_length(steps) not between 1 and 200 then return null; end if;
  for step in select value from jsonb_array_elements(steps) loop
    if step->>'kind'='repeat' then
      if jsonb_typeof(step->'count') is distinct from 'number'
        or not pg_input_is_valid(step->>'count','integer') then return null; end if;
      repeats := (step->>'count')::integer;
      if repeats not between 2 and 50 then return null; end if;
      seconds := repeats*mile_training_private.cycling_timed_seconds(step->'steps',nesting+1);
    elsif step->>'kind'='step' then
      if coalesce(step->>'intensity','') not in ('warmup','active','interval','recovery','rest','cooldown')
        or step#>>'{duration,kind}' is distinct from 'time'
        or jsonb_typeof(step#>'{duration,seconds}') is distinct from 'number'
        or not pg_input_is_valid(step#>>'{duration,seconds}','integer')
        or coalesce(step#>>'{target,kind}','') not in ('power','heart_rate','rpe','open')
        then return null; end if;
      seconds := (step#>>'{duration,seconds}')::integer;
    else
      return null;
    end if;
    if seconds is null or seconds not between 1 and 28800 then return null; end if;
    total := total+seconds;
    if total>28800 then return null; end if;
  end loop;
  return total;
end;
$$;
revoke all on function mile_training_private.cycling_timed_seconds(jsonb,integer)
  from public, anon, authenticated, service_role;

-- Reuse the shared evidence receipt, consent RPC and training-row lock.
-- Cycling v1 replaces one eligible imminent hard ride with an easy spin.
create function mile_training_private.cycling_recovery_proposal(
  athlete uuid, document jsonb, evaluated_at timestamptz
) returns jsonb language plpgsql set search_path = ''
as $$
declare
  cutoff date := (evaluated_at at time zone interval '+14:00')::date;
  recent_cutoff date := (evaluated_at at time zone interval '-12:00')::date - 2;
  evidence_day date;
  evidence jsonb;
  workout jsonb;
  revised jsonb;
  session_minutes integer;
  instructions text;
begin
  if jsonb_typeof(document->'workouts') is distinct from 'array'
    or jsonb_typeof(document->'blocks') is distinct from 'array' then
    return null;
  end if;

  -- Only the two most recent saved check-ins count. A newer low or malformed
  -- rating supersedes an earlier high value. Notes never enter the receipt.
  select max(day), jsonb_agg(jsonb_build_object('date',day,'fatigue',fatigue::integer) order by day desc)
  into evidence_day, evidence
  from (
    select cutoff-offset_days as day,
      document#>>array['checkins',(cutoff-offset_days)::text,'fatigue'] as fatigue
    from generate_series(0,6) as days(offset_days)
    where document#>array['checkins',(cutoff-offset_days)::text] is not null
    order by offset_days limit 2
  ) latest
  where fatigue in ('7','8','9','10');
  if coalesce(jsonb_array_length(evidence),0) <> 2 or evidence_day < recent_cutoff then
    return null;
  end if;

  -- Compare the next visible ride. Never skip an easier session to change a
  -- more distant one, or choose between two scheduled sessions on one day.
  select w into workout
  from jsonb_array_elements(document->'workouts') as entries(w)
  where w->>'sport' = 'Cycling' and w->>'status' = 'planned'
    and w->>'matchId' is null and w->>'completedAt' is null and w->>'completed_at' is null
    and w->>'date' > cutoff::text and w->>'date' <= (cutoff+7)::text
    and exists (
      select 1 from jsonb_array_elements(document->'blocks') b
      where b->>'id'=w->>'block' and b->>'sport'='Cycling'
        and b->'calendarVisible' is distinct from 'false'::jsonb
    )
  order by w->>'date', w->>'id' limit 1;

  if workout is null or workout->'cyclingPlanVersion' is distinct from '1'::jsonb
    or workout->'demanding' is distinct from 'true'::jsonb
    or workout->'revision' is distinct from '1'::jsonb
    or (workout->>'ownerId' is not null and workout->>'ownerId' <> athlete::text)
    or (workout->>'user_id' is not null and workout->>'user_id' <> athlete::text)
    or coalesce(workout->>'id','') !~ '^[a-zA-Z0-9_.-]{1,128}$'
    or not pg_input_is_valid(workout->>'date','date')
    or jsonb_typeof(workout->'detail') is distinct from 'string'
    or length(workout->>'detail') not between 1 and 16000
    or workout->'structuredDetail' is distinct from workout->'detail'
    or jsonb_typeof(workout->'structuredSteps') is distinct from 'array'
    or jsonb_typeof(workout->'plannedMinutes') is distinct from 'number'
    or not pg_input_is_valid(workout->>'plannedMinutes','integer')
    or (select count(*) from jsonb_array_elements(document->'workouts') w where w->>'id'=workout->>'id') <> 1
    or (select count(*) from jsonb_array_elements(document->'workouts') w
        where w->>'sport'='Cycling' and w->>'date'=workout->>'date' and w->>'status'='planned') <> 1
    or mile_running_private.has_garmin_publication(athlete,workout->>'id') then
    return null;
  end if;
  session_minutes := (workout->>'plannedMinutes')::integer;
  if session_minutes not between 15 and 480
    or mile_training_private.cycling_timed_seconds(workout->'structuredSteps') is distinct from session_minutes*60
    then return null; end if;
  session_minutes := least(30,session_minutes);
  instructions := format('Warm-up: 5 min · RPE 1–2/10. Main: %s min · RPE 1–2/10. Cooldown: 5 min · RPE 1–2/10.',session_minutes-10);
  revised := workout || jsonb_build_object(
    'revision',2,'revisionSource','cycling-recovery-v1','kind','recovery','name','Easy recovery spin',
    'purpose','Reduce the next ride’s training demand.',
    'focus','Keep pedal pressure light. Rest instead if you still feel unusually tired.',
    'plannedMinutes',session_minutes,'demanding',false,'method','rpe','equipment','Perceived effort',
    'detail',instructions,'structuredDetail',instructions,
    'structuredSteps',(select jsonb_agg(jsonb_build_object(
        'kind','step','intensity',step.intensity,'duration',jsonb_build_object('kind','time','seconds',step.seconds),
        'target','{"kind":"rpe","low":1,"high":2}'::jsonb
      ) order by step.position)
      from (values (1,'warmup',300),(2,'active',(session_minutes-10)*60),(3,'cooldown',300))
      as step(position,intensity,seconds))
  );
  return jsonb_build_object('policy','cycling-recovery-v1','evidenceDay',evidence_day,
    'evidence',jsonb_build_object('source','athlete-checkins','checkins',evidence),
    'before',workout,'after',revised,'operation','{"type":"replace-with-easy-spin"}'::jsonb);
end;
$$;
revoke all on function mile_training_private.cycling_recovery_proposal(uuid,jsonb,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function mile_training_private.evaluate_revision(
  athlete uuid, sport text, document jsonb, evaluated_at timestamptz
) returns jsonb language plpgsql set search_path = ''
as $$
begin
  case sport
    when 'Running' then return mile_running_private.recovery_proposal(athlete, document, evaluated_at);
    when 'Cycling' then return mile_training_private.cycling_recovery_proposal(athlete, document, evaluated_at);
    else raise sqlstate 'PT422' using message = 'No revision policy is available for this sport';
  end case;
end;
$$;

-- Approved receipts already contain exact before and after snapshots. Use
-- them as the ledger for stale cloud writes and keep completed rides intact.
create function mile_training_private.guard_cycling_revisions() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  mutable_fields constant text[] := array['status','matchId','note','rpe','completedAt','completed_at','cyclingMatchPrescription'];
begin
  if exists (
    select 1
    from mile_training_private.revision_proposals r
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(new.training_data->'workouts')='array' then new.training_data->'workouts' else '[]'::jsonb end
    ) w(workout) on w.workout->>'id'=r.after_workout->>'id'
    left join lateral jsonb_array_elements(
      case when jsonb_typeof(old.training_data->'workouts')='array' then old.training_data->'workouts' else '[]'::jsonb end
    ) previous(workout) on previous.workout->>'id'=r.after_workout->>'id'
    where r.user_id=new.user_id and r.sport='Cycling' and r.approved_at is not null
    group by r.id
    having count(w.workout) <> 1
      or bool_or(w.workout - mutable_fields is distinct from r.after_workout - mutable_fields)
      or bool_or(
        (previous.workout->>'status' in ('done','completed') and w.workout->'status' is distinct from previous.workout->'status')
        or (previous.workout->>'matchId' is not null and w.workout->'matchId' is distinct from previous.workout->'matchId')
        or (previous.workout->>'completedAt' is not null and w.workout->'completedAt' is distinct from previous.workout->'completedAt')
        or (previous.workout->>'completed_at' is not null and w.workout->'completed_at' is distinct from previous.workout->'completed_at')
      )
  ) then
    raise sqlstate 'PT409' using message='A cycling workout revision conflicts with this cloud save',
      detail='mile_cycling_revision_conflict';
  end if;
  return new;
end;
$$;
revoke all on function mile_training_private.guard_cycling_revisions() from public, anon, authenticated, service_role;
create trigger mile_guard_cycling_revisions before update of training_data on public.av_training_data
for each row execute function mile_training_private.guard_cycling_revisions();

create or replace function mile_training_private.approve_revision(p_proposal_id uuid, p_approved boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  athlete uuid := auth.uid();
  document jsonb := mile_training_private.lock_document(athlete);
  evaluated_at timestamptz := clock_timestamp();
  proposal mile_training_private.revision_proposals%rowtype;
  candidate jsonb;
  result jsonb;
  workout_index integer;
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
    when 'Cycling' then
      select ordinality-1 into strict workout_index
      from jsonb_array_elements(document->'workouts') with ordinality as entries(w,ordinality)
      where w->>'id'=proposal.before_workout->>'id';
      result := jsonb_build_object('status','applied','workout',proposal.after_workout,
        'revision',(proposal.after_workout->>'revision')::integer,'garminRepublication',false);
    else raise sqlstate 'PT422' using message = 'No revision writer is available for this sport';
  end case;

  update mile_training_private.revision_proposals
  set approved_at=evaluated_at, receipt=result where id=proposal.id;
  if proposal.sport='Cycling' then
    update public.av_training_data
    set training_data=jsonb_set(document,array['workouts',workout_index::text],proposal.after_workout,false),
      updated_at=evaluated_at
    where user_id=athlete;
  end if;
  return result;
end;
$$;

create function mile_training_private.cycling_revision_history() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare athlete uuid := auth.uid();
begin
  if athlete is null or not exists (select 1 from public.av_members where user_id=athlete) then
    raise sqlstate 'PT403' using message='MILE membership required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('approvedAt',approved_at,
      'before',jsonb_build_object('name',before_workout->>'name','date',before_workout->>'date',
        'plannedMinutes',before_workout->'plannedMinutes'),
      'after',jsonb_build_object('name',after_workout->>'name','plannedMinutes',after_workout->'plannedMinutes'))
      order by approved_at desc,id)
    from (
      select id,approved_at,before_workout,after_workout
      from mile_training_private.revision_proposals
      where user_id=athlete and sport='Cycling' and approved_at is not null
      order by approved_at desc,id limit 10
    ) history
  ),'[]'::jsonb);
end;
$$;
create function public.mile_cycling_revision_history() returns jsonb
language sql stable security invoker set search_path = ''
as $$ select mile_training_private.cycling_revision_history() $$;
revoke all on function mile_training_private.cycling_revision_history(),public.mile_cycling_revision_history()
  from public, anon, authenticated, service_role;
grant execute on function mile_training_private.cycling_revision_history(),public.mile_cycling_revision_history()
  to authenticated;
