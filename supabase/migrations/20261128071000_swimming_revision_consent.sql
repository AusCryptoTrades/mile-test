-- Bounded swim recovery uses the existing authenticated proposal ledger.
create function mile_training_private.swimming_recovery_proposal(
 athlete uuid, document jsonb, evaluated_at timestamptz
) returns jsonb language plpgsql set search_path = ''
as $$
declare
 cutoff date := (evaluated_at at time zone interval '+14:00')::date;
 evidence_day date;
 evidence jsonb;
 sessions jsonb;
 original jsonb;
 revised jsonb;
 step jsonb;
 pool numeric;
 total_meters numeric := 0;
 total_rest integer := 0;
 step_meters numeric;
 lengths integer;
 easy_meters numeric;
 easy_seconds integer;
 details text;
begin
 if jsonb_typeof(document->'workouts') is distinct from 'array'
    or jsonb_typeof(document->'blocks') is distinct from 'array' then return null; end if;
 select max(day), jsonb_agg(jsonb_build_object('date',day,'fatigue',fatigue::integer) order by day desc)
 into evidence_day, evidence
 from (
   select cutoff-offset_days as day,
     document#>>array['checkins',(cutoff-offset_days)::text,'fatigue'] as fatigue
   from generate_series(0,6) as dates(offset_days)
   where document#>array['checkins',(cutoff-offset_days)::text] is not null
   order by offset_days limit 2
 ) latest
 where fatigue in ('7','8','9','10');
 if coalesce(jsonb_array_length(evidence),0) <> 2
   or evidence_day < (evaluated_at at time zone interval '-12:00')::date-2 then return null; end if;

 sessions := document->'workouts';
 select w into original from jsonb_array_elements(sessions) entries(w)
 where w->>'sport'='Swimming' and w->>'status'='planned' and w->>'date'>cutoff::text
   and w->>'date'<=(cutoff+7)::text
   and exists (select 1 from jsonb_array_elements(document->'blocks') b
     where b->>'id'=w->>'block' and b->>'sport'='Swimming' and b->'calendarVisible' is distinct from 'false'::jsonb)
 order by w->>'date', w->>'id' limit 1;

 if original is null or original->'swimmingPlanVersion' is distinct from '1'::jsonb
   or original->'revision' is distinct from '1'::jsonb
   or original->'demanding' is distinct from 'true'::jsonb
   or coalesce(original->>'family','') not in ('css','speed')
   or original->>'matchId' is not null or original->>'completedAt' is not null or original->>'completed_at' is not null
   or (original->>'ownerId' is not null and original->>'ownerId'<>athlete::text)
   or (original->>'user_id' is not null and original->>'user_id'<>athlete::text)
   or coalesce(original->>'id','') !~ '^[a-zA-Z0-9_.-]{1,128}$'
   or not pg_input_is_valid(original->>'date','date')
   or jsonb_typeof(original->'detail') is distinct from 'string'
   or length(original->>'detail') not between 1 and 24000
   or original->'structuredDetail' is distinct from original->'detail'
   or jsonb_typeof(original->'structuredSteps') is distinct from 'array'
   or jsonb_typeof(original->'poolMeters') is distinct from 'number'
   or jsonb_typeof(original->'meters') is distinct from 'number'
   or jsonb_typeof(original->'km') is distinct from 'number'
   or jsonb_typeof(original->'estimatedSeconds') is distinct from 'number'
   or jsonb_typeof(original->'plannedMinutes') is distinct from 'number'
   or not pg_input_is_valid(coalesce(original->>'estimatedSeconds',''),'integer')
   or not pg_input_is_valid(coalesce(original->>'plannedMinutes',''),'integer')
   or (select count(*) from jsonb_array_elements(sessions) w where w->>'id'=original->>'id')<>1
   or (select count(*) from jsonb_array_elements(sessions) w where w->>'sport'='Swimming'
       and w->>'date'=original->>'date' and w->>'status'='planned')<>1
   or mile_running_private.has_garmin_publication(athlete,original->>'id') then return null; end if;
 pool := (original->>'poolMeters')::numeric;
 if pool not in (22.86,25,50) or jsonb_array_length(original->'structuredSteps') not between 3 and 200
    or original#>>'{structuredSteps,0,intensity}' is distinct from 'warmup'
    or original#>>'{structuredSteps,-1,intensity}' is distinct from 'cooldown'
    or not exists (select 1 from jsonb_array_elements(original->'structuredSteps') w where w->>'intensity'='interval')
 then return null; end if;
 for step in select value from jsonb_array_elements(original->'structuredSteps') loop
   if step->>'kind' is distinct from 'step' then return null; end if;
   if step->>'intensity'='rest' then
     if step#>>'{duration,kind}' is distinct from 'time' or step#>>'{target,kind}' is distinct from 'open'
       or jsonb_typeof(step#>'{duration,seconds}') is distinct from 'number'
       or not pg_input_is_valid(coalesce(step#>>'{duration,seconds}',''),'integer') then return null; end if;
     if (step#>>'{duration,seconds}')::integer not between 1 and 180 then return null; end if;
     total_rest := total_rest+(step#>>'{duration,seconds}')::integer;
   else
     if coalesce(step->>'intensity','') not in ('warmup','active','interval','cooldown')
       or step#>>'{duration,kind}' is distinct from 'distance'
       or jsonb_typeof(step#>'{duration,meters}') is distinct from 'number'
       or coalesce(step#>>'{target,kind}','') not in ('open','swim_pace') then return null; end if;
     step_meters := (step#>>'{duration,meters}')::numeric;
     if step_meters not between pool and 10000 or mod(step_meters,pool)<>0 then return null; end if;
     if step#>>'{target,kind}'='swim_pace' then
       if jsonb_typeof(step#>'{target,fastSecondsPer100m}') is distinct from 'number'
         or jsonb_typeof(step#>'{target,slowSecondsPer100m}') is distinct from 'number'
         or not pg_input_is_valid(coalesce(step#>>'{target,fastSecondsPer100m}',''),'integer')
         or not pg_input_is_valid(coalesce(step#>>'{target,slowSecondsPer100m}',''),'integer') then return null; end if;
       if (step#>>'{target,fastSecondsPer100m}')::integer not between 40 and 480
         or (step#>>'{target,slowSecondsPer100m}')::integer not between
           (step#>>'{target,fastSecondsPer100m}')::integer and 480 then return null; end if;
     end if;
     total_meters := total_meters+step_meters;
   end if;
 end loop;
 if total_meters<>(original->>'meters')::numeric or abs(total_meters/1000-(original->>'km')::numeric)>.00001
   or (original->>'plannedMinutes')::integer not between 6 and 180
   or (original->>'estimatedSeconds')::integer not between total_rest+1 and 10800
   or ceil((original->>'estimatedSeconds')::numeric/60)<>(original->>'plannedMinutes')::integer then return null; end if;

 lengths := least(8, floor(total_meters/pool/2)::integer,
   floor(((original->>'estimatedSeconds')::integer-60)*100/(pool*300))::integer);
 if lengths<3 then return null; end if;
 easy_meters := lengths*pool;
 easy_seconds := ceil(pool*300/100)::integer*lengths+20*(lengths-1);
 if easy_seconds>(original->>'estimatedSeconds')::integer then return null; end if;
 details := format('%s easy lengths of %s m with 20 seconds at the wall between lengths.', lengths,pool);
 revised := original || jsonb_build_object('revision',2,'revisionSource','swimming-recovery-v1',
   'kind','reviewed-recovery','family','recovery','name','Easy recovery swim','demanding',false,'equipment',null,
   'purpose','Reduce demand for the next swim.','focus','Swim each length comfortably. Rest instead if the fatigue continues.',
   'meters',easy_meters,'km',easy_meters/1000,'estimatedSeconds',easy_seconds,'plannedMinutes',ceil(easy_seconds::numeric/60),
   'detail',details,'structuredDetail',details,'structuredSteps',(
    select jsonb_agg(item order by n, position)
    from generate_series(1,lengths) n
    cross join lateral (values
      (1,jsonb_build_object('kind','step','intensity',case when n=1 then 'warmup' when n=lengths then 'cooldown' else 'active' end,
        'duration',jsonb_build_object('kind','distance','meters',pool),'target','{"kind":"open"}'::jsonb,'description','Easy and relaxed')),
      (2,'{"kind":"step","intensity":"rest","duration":{"kind":"time","seconds":20},"target":{"kind":"open"},"description":"Rest at the wall"}'::jsonb)
    ) steps(position,item) where position=1 or n<lengths
   ));
 return jsonb_build_object('policy','swimming-recovery-v1','evidenceDay',evidence_day,
   'evidence',jsonb_build_object('source','athlete-checkins','checkins',evidence),
   'before',original,'after',revised,'operation','{"type":"replace-with-easy-swim"}'::jsonb);
end;
$$;
revoke all on function mile_training_private.swimming_recovery_proposal(uuid,jsonb,timestamptz)
 from public, anon, authenticated, service_role;

create or replace function mile_training_private.evaluate_revision(
  athlete uuid, sport text, document jsonb, evaluated_at timestamptz
) returns jsonb language plpgsql set search_path = ''
as $$
begin
  case sport
    when 'Running' then return mile_running_private.recovery_proposal(athlete, document, evaluated_at);
    when 'Cycling' then return mile_training_private.cycling_recovery_proposal(athlete, document, evaluated_at);
    when 'Swimming' then return mile_training_private.swimming_recovery_proposal(athlete, document, evaluated_at);
    else raise sqlstate 'PT422' using message = 'No revision policy is available for this sport';
  end case;
end;
$$;

create function mile_training_private.guard_swimming_revisions() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  mutable_fields constant text[] := array['status','matchId','note','rpe','completedAt','completed_at','swimmingMatchPrescription'];
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
    where r.user_id=new.user_id and r.sport='Swimming' and r.approved_at is not null
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
    raise sqlstate 'PT409' using message='A swimming workout revision conflicts with this cloud save',
      detail='mile_swimming_revision_conflict';
  end if;
  return new;
end;
$$;
revoke all on function mile_training_private.guard_swimming_revisions() from public, anon, authenticated, service_role;
create trigger mile_guard_swimming_revisions before update of training_data on public.av_training_data
for each row execute function mile_training_private.guard_swimming_revisions();

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
    when 'Cycling', 'Swimming' then
      select ordinality-1 into strict workout_index
      from jsonb_array_elements(document->'workouts') with ordinality as entries(w,ordinality)
      where w->>'id'=proposal.before_workout->>'id';
      result := jsonb_build_object('status','applied','workout',proposal.after_workout,
        'revision',(proposal.after_workout->>'revision')::integer,'garminRepublication',false);
    else raise sqlstate 'PT422' using message = 'No revision writer is available for this sport';
  end case;

  update mile_training_private.revision_proposals
  set approved_at=evaluated_at, receipt=result where id=proposal.id;
  if proposal.sport in ('Cycling','Swimming') then
    update public.av_training_data
    set training_data=jsonb_set(document,array['workouts',workout_index::text],proposal.after_workout,false),
      updated_at=evaluated_at
    where user_id=athlete;
  end if;
  return result;
end;
$$;

create function mile_training_private.swimming_revision_history() returns jsonb
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
      where user_id=athlete and sport='Swimming' and approved_at is not null
      order by approved_at desc,id limit 10
    ) history
  ),'[]'::jsonb);
end;
$$;
create function public.mile_swimming_revision_history() returns jsonb
language sql stable security invoker set search_path = ''
as $$ select mile_training_private.swimming_revision_history() $$;
revoke all on function mile_training_private.swimming_revision_history(),public.mile_swimming_revision_history()
  from public, anon, authenticated, service_role;
grant execute on function mile_training_private.swimming_revision_history(),public.mile_swimming_revision_history()
  to authenticated;
