begin;
do $$
declare
  original jsonb := '{
    "runningPlanVersion":3,"kind":"easy","revision":1,"meters":11000,"km":11,"estimatedSeconds":3905,"plannedMinutes":66,
    "detail":"Run: 11 km · Z2 Easy aerobic · 120–145 bpm.","structuredDetail":"Run: 11 km · Z2 Easy aerobic · 120–145 bpm.",
    "structuredSteps":[{"kind":"step","intensity":"active","duration":{"kind":"distance","meters":11000},
    "target":{"kind":"heart_rate","lowBpm":120,"highBpm":145,"zone":"Z2"}}]}'::jsonb;
  after_workout jsonb;
  short_workout jsonb;
begin
  after_workout := mile_running_private.reduce_aerobic_workout(original, 1, 0.9);
  if after_workout->>'meters' is distinct from '10000'
    or after_workout#>'{structuredSteps,0,target}' is distinct from original#>'{structuredSteps,0,target}'
    or after_workout->>'detail' is distinct from 'Run: 10 km · Z2 Easy aerobic · 120–145 bpm.'
    or after_workout->>'plannedMinutes' is distinct from '60'
    or after_workout->>'revision' is distinct from '2' then
    raise exception 'Whole kilometre recovery proposal is inconsistent: %', after_workout;
  end if;
  short_workout := jsonb_set(original || '{"meters":3000,"km":3}', '{structuredSteps,0,duration,meters}', '3000'::jsonb);
  begin
    perform mile_running_private.reduce_aerobic_workout(short_workout, 1, 0.9);
    raise exception 'Short workout should not receive a disproportionate adjustment';
  exception when sqlstate 'PT422' then null; end;
end;
$$;
rollback;
select 'Whole-kilometre recovery proposals and targets passed' as result;
